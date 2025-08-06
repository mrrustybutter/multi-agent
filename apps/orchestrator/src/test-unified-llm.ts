/**
 * Test script for unified LLM system
 */

import { 
  UnifiedLLMClient, 
  LLMRouter, 
  getAvailableProviders,
  getBestProviderForUseCase
} from '@rusty-butter/shared';

async function testUnifiedLLMSystem() {
  console.log('🧪 Testing Unified LLM System...\n');

  // Test provider configuration
  const available = getAvailableProviders();
  console.log('📋 Available providers:');
  available.forEach(provider => {
    console.log(`  - ${provider.name}: ${provider.description}`);
  });
  console.log();

  // Test router
  const router = new LLMRouter();
  const testEvents = [
    {
      id: 'test-1',
      source: 'test',
      type: 'chat_message',
      priority: 'medium' as const,
      data: { message: 'Hello, please recall our previous conversation and speak a greeting' },
      timestamp: new Date()
    },
    {
      id: 'test-2', 
      source: 'test',
      type: 'chat_message',
      priority: 'medium' as const,
      data: { message: 'Help me implement a React component for user authentication' },
      timestamp: new Date()
    },
    {
      id: 'test-3',
      source: 'twitter',
      type: 'chat_message', 
      priority: 'medium' as const,
      data: { message: 'What\'s trending in AI today?' },
      timestamp: new Date()
    }
  ];

  console.log('🎯 Testing routing decisions:');
  testEvents.forEach(event => {
    const decision = router.routeEvent(event);
    console.log(`  ${event.data.message.substring(0, 40)}...`);
    console.log(`    → ${decision.provider} (${decision.useCase}) - ${decision.reason}\n`);
  });

  // Test unified client if providers are available
  if (available.length > 0) {
    console.log('🤖 Testing LLM client...');
    
    const client = new UnifiedLLMClient(available.map(p => p.name));
    const testProvider = available[0].name;
    
    try {
      const working = await client.testProvider(testProvider);
      console.log(`✅ ${testProvider} connection test: ${working ? 'passed' : 'failed'}`);
      
      if (working) {
        console.log(`🎯 Generating test response with ${testProvider}...`);
        const response = await client.generateResponse(testProvider, [
          { role: 'user', content: 'Say hello in exactly 3 words' }
        ], { maxTokens: 20 });
        
        console.log(`📤 Response: "${response.content}"`);
        console.log(`📊 Tokens: ${response.usage?.totalTokens || 'unknown'}`);
      }
    } catch (error) {
      console.warn(`⚠️ Test failed:`, error);
    }
  } else {
    console.log('⚠️ No LLM providers available for testing');
  }

  // Test use case recommendations  
  console.log('\n💡 Use case recommendations:');
  const useCases: Array<'coding' | 'chat' | 'fast' | 'social' | 'tools'> = ['coding', 'chat', 'fast', 'social', 'tools'];
  useCases.forEach(useCase => {
    const provider = getBestProviderForUseCase(useCase);
    console.log(`  ${useCase}: ${provider}`);
  });

  console.log('\n✅ Unified LLM system test completed!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testUnifiedLLMSystem().catch(console.error);
}

export { testUnifiedLLMSystem };