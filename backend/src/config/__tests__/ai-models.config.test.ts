import assert from 'node:assert/strict';
import test from 'node:test';

test('uses the configured chat model as the topic-profile default', async () => {
  const previousTopicModel = process.env.TOPIC_PROFILE_MODEL;
  const previousQuestionModel = process.env.OPENROUTER_QUESTION_MODEL;
  const previousCompletionFallback = process.env.QUESTION_COMPLETION_FALLBACK_MODEL;
  delete process.env.TOPIC_PROFILE_MODEL;
  delete process.env.QUESTION_COMPLETION_FALLBACK_MODEL;
  process.env.OPENROUTER_QUESTION_MODEL = 'openai/test-chat-model';
  try {
    const { aiModels } = await import('../ai-models.config.js');
    assert.equal(aiModels.topicProfile, 'openai/test-chat-model');
    assert.equal(aiModels.questionCompletionFallback, 'openai/test-chat-model');
  } finally {
    if (previousTopicModel === undefined) delete process.env.TOPIC_PROFILE_MODEL;
    else process.env.TOPIC_PROFILE_MODEL = previousTopicModel;
    if (previousQuestionModel === undefined) delete process.env.OPENROUTER_QUESTION_MODEL;
    else process.env.OPENROUTER_QUESTION_MODEL = previousQuestionModel;
    if (previousCompletionFallback === undefined) delete process.env.QUESTION_COMPLETION_FALLBACK_MODEL;
    else process.env.QUESTION_COMPLETION_FALLBACK_MODEL = previousCompletionFallback;
  }
});
