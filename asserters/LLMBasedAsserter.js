const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

module.exports = class LLMBasedAsserter {
  constructor(context, caps, globalArgs) {
    this.context = context;
    this.caps = caps;
    this.globalArgs = globalArgs;

    this.model = process.env.MODEL_NAME || 'amazon.nova-micro-v1:0';
    this.bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'eu-west-2' });
    this.mode = globalArgs.mode || 'score';
    this.passingScore = globalArgs.passing_score || 80;
  }


  getBasePrompt() {
    return `You are an expert evaluator testing chatbot response quality.

      OUTPUT FORMAT:
      Return ONLY valid JSON with this exact structure:
      For score mode:
      {"score": <number 0-100>, "reason": "<brief explanation>"}

      For pass/fail mode:
      {"result": "<PASS or FAIL>", "reason": "<brief explanation>"}

      GENERAL GUIDELINES:
      - Be strict with technical data (IDs, dates, amounts, status)
      - Be lenient with natural language variations
      - Assess based on the provided criteria, not generic standards`;
  }

  getDefaultComparisonCriteria() {
    return `EVALUATION MODE: Expected vs Actual Comparison

      Your task: Compare the EXPECTED response against the ACTUAL chatbot response.

      EVALUATION CRITERIA:
      1. Semantic Equivalence: Do both responses convey the same core message?
      2. Factual Accuracy: Does the actual response contain all key facts from expected response?
      3. Completeness: For lists/data (orders, bookings, etc.), are all important details present?
      4. Intent Match: Does the actual response fulfill the same user need as expected?

      CRITICAL FOR TECHNICAL RESPONSES:
      - All data points must be accurate (IDs, dates, amounts, status)
      - List items must match (order names/numbers/details)
      - No missing key information

      SCORING GUIDE:
      - 90-100: Perfect match - same meaning, all details present
      - 70-89: Good match - same meaning, minor details missing/different
      - 50-69: Partial match - similar intent but missing important details
      - 0-49: Poor match - different meaning or critical information missing`;
  }


  async assertConvoStep({ convo, convoStep, args, isGlobal, botMsg }) {
    try {
      if (!args || args.length === 0) {
        return Promise.resolve();
      }

      const assertionInput = args[0];
      const actualResponse = botMsg.messageText;
      console.log('Actual Response:', actualResponse);
      let result;

      if (assertionInput.startsWith('EXPECTED_RESPONSE:')) {
        console.log('\x1b[36m%s\x1b[0m', 'Mode: EXPECTED_RESPONSE (Compare Expected vs Actual)');

        const expectedResponse = assertionInput.replace(/^EXPECTED_RESPONSE:\s*/, '').trim();
        console.log('\x1b[34m%s\x1b[0m', 'Expected response: ', expectedResponse);

        if (!expectedResponse || !actualResponse) {
          throw new Error('Both expected and actual responses must be non-empty strings');
        }

        result = await this.evaluateExpectedVsActual(expectedResponse, actualResponse);

      } else if (assertionInput.startsWith('CUSTOM_EVALUATION_PROMPT:')) {
        console.log('\x1b[36m%s\x1b[0m', 'Mode: CUSTOM_EVALUATION_PROMPT (Custom criteria extends base)');

        const customPrompt = assertionInput.replace(/^CUSTOM_EVALUATION_PROMPT:\s*/, '').trim();
        result = await this.evaluateWithCustomPrompt(actualResponse, customPrompt);

      } else {
        throw new Error(
          'Assertion must start with either "EXPECTED_RESPONSE:" or "CUSTOM_EVALUATION_PROMPT:". ' +
          `Got: ${assertionInput.substring(0, 50)}...`
        );
      }

      console.log(`LLM evaluation result:`, result);

      if (this.mode === 'score') {
        const score = result.score;
        if (isNaN(score)) throw new Error('Invalid score returned from LJM');

        if (score < this.passingScore) {
          throw new Error(
            `Score ${score} < passing score ${this.passingScore}. ` +
            `Reason: ${result.reason}`
          );
        }
      } else if (this.mode === 'passfail') {
        if (result.result !== 'PASS') {
          throw new Error(
            `LJM judged as FAIL. Reason: ${result.reason}`
          );
        }
      }

      return Promise.resolve();
    } catch (error) {
      return Promise.reject(new Error(`LLM Assertion Failed: ${error.message}`));
    }
  }

  async evaluateExpectedVsActual(expected, actual) {
    const basePrompt = this.getBasePrompt();
    const criteria = this.getDefaultComparisonCriteria();
    const fullPrompt = `${basePrompt}\n\n${criteria}`;

    const userPrompt = `Expected: "${expected}"
    Actual: "${actual}"
    Mode: "${this.mode}"
    Passing Score: ${this.passingScore}`;

    return this.callBedrock(fullPrompt, userPrompt);
  }

  async evaluateWithCustomPrompt(actual, customPrompt) {
    const basePrompt = this.getBasePrompt();

    const fullPrompt = `${basePrompt}\n\n${customPrompt}`;

    const userPrompt = `Actual Response: "${actual}"
      Mode: "${this.mode}"
      Passing Score: ${this.passingScore}`;

    return this.callBedrock(fullPrompt, userPrompt);
  }


  async callBedrock(systemPrompt, userPrompt) {
    const body = JSON.stringify({
      messages: [
        {
          role: 'user',
          content: [
            {
              text: `${systemPrompt}\n\n${userPrompt}`
            }
          ]
        }
      ],
      inferenceConfig: {
        maxTokens: 512,
        temperature: 0.0
      }
    });

    const command = new InvokeModelCommand({
      modelId: this.model,
      contentType: 'application/json',
      accept: 'application/json',
      body,
    });

    const response = await this.bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    const rawText = responseBody.output?.message?.content?.[0]?.text?.trim() || '';

    try {
      return JSON.parse(rawText);
    } catch {
      throw new Error(`Failed to parse Bedrock response: ${rawText}`);
    }
  }
}