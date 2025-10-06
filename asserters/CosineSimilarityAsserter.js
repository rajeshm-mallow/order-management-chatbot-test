

module.exports = class CosineSimilarityAsserter {
  constructor(context, caps, globalArgs) {
    this.context = context;
    this.caps = caps;
    this.globalArgs = globalArgs;
    this.pipeline = null;
    this.threshold = globalArgs.threshold || 0.8;
    this.modelName = globalArgs.model_name || 'Xenova/all-MiniLM-L6-v2';
  }

  async initializePipeline() {
    if (!this.pipeline) {
      try {
        const { pipeline } = await import('@xenova/transformers');
        
        this.pipeline = await pipeline('feature-extraction', this.modelName);
      } catch (error) {
        throw new Error(`Failed to initialize pipeline ${this.modelName}: ${error.message}`);
      }
    }
  }

  async assertConvoStep({ convo, convoStep, args, isGlobal, botMsg, scriptingMemory }) {
    try {
      await this.initializePipeline();

      if (!args || args.length === 0) {
        console.log('CosineSimilarityAsserter: no args provided — skipping assertion for this invocation');
        return Promise.resolve();
      }


      const expectedResponse = args[0];
      const actualResponse = botMsg.messageText;

      if (!actualResponse || !expectedResponse) {
        throw new Error('Both expected and actual responses must be non-empty strings');
      }

      const customThreshold = args.length > 1 ? parseFloat(args[1]) : this.threshold;

      if (isNaN(customThreshold) || customThreshold < 0 || customThreshold > 1) {
        throw new Error('Threshold must be a number between 0 and 1');
      }

      // Generate embeddings using the correct API
      const [expectedEmbedding, actualEmbedding] = await Promise.all([
        this.pipeline(expectedResponse, { pooling: 'mean', normalize: true }),
        this.pipeline(actualResponse, { pooling: 'mean', normalize: true })
      ]);

      // Calculate cosine similarity
      const similarity = this.cosineSimilarity(expectedEmbedding.data, actualEmbedding.data);

      console.log(`Cosine Similarity: ${similarity.toFixed(4)} (Threshold: ${customThreshold})`);
      console.log(`Expected: "${expectedResponse}"`);
      console.log(`Actual: "${actualResponse}"`);

      if (similarity < customThreshold) {
        throw new Error(
          `Semantic similarity ${similarity.toFixed(4)} is below threshold ${customThreshold}. ` +
          `Expected: "${expectedResponse}", Actual: "${actualResponse}"`
        );
      }

      if (scriptingMemory) {
        scriptingMemory.lastSimilarityScore = similarity;
      }

      return Promise.resolve();
    } catch (error) {
      return Promise.reject(new Error(`Cosine Similarity Assertion Failed: ${error.message}`));
    }
  }

  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }
};
