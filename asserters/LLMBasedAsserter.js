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


  async assertConvoStep({ convo, convoStep, args, isGlobal, botMsg }) {
    try {
      if (!args || args.length === 0) {
        console.log('LLMBasedAsserter: No expected text provided — skipping.');
        return Promise.resolve();
      }

      const expectedResponse = args[0];
      console.log('\x1b[34m%s\x1b[0m', 'Expected response: ', expectedResponse);

      const actualResponse = botMsg.messageText;
      console.log('\x1b[34m%s\x1b[0m', 'Actual response: ', actualResponse);

      if (!expectedResponse || !actualResponse) {
        throw new Error('Both expected and actual responses must be non-empty strings');
      }

      const result = await this.evaluateWithBedrock(expectedResponse, actualResponse);

      console.log(`LLM evaluation result:`, result);

      if (this.mode === 'score') {
        const score = result.score;
        if (isNaN(score)) throw new Error('Invalid score returned from LLM');

        if (score < this.passingScore) {
          throw new Error(
            `Score ${score} < passing score ${this.passingScore}. Expected: "${expectedResponse}" | Actual: "${actualResponse}"`
          );
        }
      } else if (this.mode === 'passfail') {
        if (result.result !== 'PASS') {
          throw new Error(`LLM judged as FAIL. Expected: "${expectedResponse}" | Actual: "${actualResponse}"`);
        }
      }

      return Promise.resolve();
    } catch (error) {
      return Promise.reject(new Error(`LLM Assertion Failed: ${error.message}`));
    }
  }

  // === AWS Bedrock evaluator ===
  async evaluateWithBedrock(expected, actual) {
    const systemPrompt = `You are an expert evaluator testing chatbot response quality.

Your task: Compare the EXPECTED response against the ACTUAL chatbot response to determine if they convey the same meaning and contain the same critical information.

EVALUATION CRITERIA:
1. Semantic Equivalence: Do both responses convey the same core message?
2. Factual Accuracy: Does the actual response contain all key facts from expected response?
3. Completeness: For lists/data (orders, bookings, etc.), are all important details present?
4. Intent Match: Does the actual response fulfill the same user need as expected?

IGNORE these differences:
- Wording variations and paraphrasing
- Stylistic differences (formal vs casual tone)
- Extra helpful details not in expected (unless they contradict it)
- Formatting differences

CRITICAL for technical responses:
- All data points must be accurate (IDs, dates, amounts, status)
- List items must match (order names/numbers/details)
- No missing key information

OUTPUT FORMAT:
Return ONLY valid JSON with this exact structure:

For score mode:
{"score": <number 0-100>, "reason": "<brief explanation>"}

For pass/fail mode:
{"result": "<PASS or FAIL>", "reason": "<brief explanation>"}

SCORING GUIDE (score mode):
- 90-100: Perfect match - same meaning, all details present
- 70-89: Good match - same meaning, minor details missing/different
- 50-69: Partial match - similar intent but missing important details
- 0-49: Poor match - different meaning or critical information missing

Be strict with technical data (lists, IDs, numbers). Be lenient with natural language variations.`;

    const userPrompt = `Expected: "${expected}"
Actual: "${actual}"
Mode: "${this.mode}"
Passing Score: ${this.passingScore}`;

    // Nova models use the messages format
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
    
    // Nova models return response in output.message.content format
    const rawText = responseBody.output?.message?.content?.[0]?.text?.trim() || '';

    try {
      return JSON.parse(rawText);
    } catch {
      throw new Error(`Failed to parse Bedrock response: ${rawText}`);
    }
  }
}