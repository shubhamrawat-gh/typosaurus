import React, { useState, useEffect } from 'react';
import { EngineConfig } from '@/engine/types';
import { NavHeader } from '@/ui/NavHeader';
import { TypingArena } from '@/ui/TypingArena';
import { scheduler } from '@/scheduler';
import { getPracticeTest } from '@/data/practice-tests';
import { CODE_TESTS_PER_LANGUAGE } from '@/data/code-snippets';

export const App: React.FC = () => {
  const [config, setConfig] = useState<EngineConfig>(() => getPracticeTest(1).config);

  const changeConfig = (nextConfig: EngineConfig) => {
    setConfig({ ...nextConfig, seed: undefined });
  };

  const nextTest = () => {
    if (config.mode === 'time' || config.mode === 'zen') {
      setConfig({ ...config, seed: typeof config.seed === 'number' ? config.seed + 1 : 1 });
      return;
    }

    if (config.mode === 'code') {
      const currentSeed = typeof config.seed === 'number' ? config.seed : -1;
      setConfig({ ...config, seed: (currentSeed + 1) % CODE_TESTS_PER_LANGUAGE });
      return;
    }

    const firstId = config.numbers ? 501 : config.punctuation ? 251 : 1;
    const currentId = typeof config.seed === 'number' && config.seed >= firstId && config.seed < firstId + 250
      ? config.seed : firstId - 1;
    const nextId = currentId + 1 >= firstId + 250 ? firstId : currentId + 1;
    setConfig(getPracticeTest(nextId).config);
  };

  useEffect(() => {
    scheduler.start();
    return () => scheduler.stop();
  }, []);

  return (
    <div className="app-shell">
      <NavHeader config={config} onConfigChange={changeConfig} />
      <main className="app-main">
        <TypingArena config={config} onNextTest={nextTest} />
      </main>
    </div>
  );
};
