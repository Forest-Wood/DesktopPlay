import { describe, expect, it } from 'vitest';
import { PhrasePlayback, phraseDisplays, validatePhraseDisplays } from '../../src/shared/phrases';
const library = { whale: ['a', 'b', 'c', 'd'], gpt: ['x'], dragon: ['y'] };
describe('phrase selection and playback', () => {
  it('migrates all candidates and rejects invalid counts, selections and insufficient pools', () => {
    const defaults = phraseDisplays(library); expect(defaults.whale).toEqual({ count: 4, mode: 'sequential', selectedIndices: [0, 1, 2, 3] });
    for (const patch of [{ count: 1.5 }, { count: 21 }, { count: -1 }, { selectedIndices: [0, 0] }, { selectedIndices: [9] }, { count: 3, selectedIndices: [0, 1] }, { mode: 'unknown' }]) {
      expect(() => validatePhraseDisplays({ ...defaults, whale: { ...defaults.whale, ...patch } }, library)).toThrow();
    }
    expect(() => validatePhraseDisplays({ ...defaults, whale: { count: 0, mode: 'random', selectedIndices: [] } }, library)).not.toThrow();
  });
  it('continues after actually viewed phrases, retains a stable round, and separates personas', () => {
    const player = new PhrasePlayback(), config = { count: 2, mode: 'sequential' as const, selectedIndices: [0, 2, 3] };
    player.begin('whale', config); expect(player.lines(library.whale)).toEqual(['a', 'c']);
    player.viewed(0); expect(player.lines(library.whale)).toEqual(['a', 'c']);
    player.begin('gpt', { count: 1, mode: 'sequential', selectedIndices: [0] }); player.viewed(0);
    player.begin('whale', config); expect(player.lines(library.whale)).toEqual(['c', 'd']); player.viewed(1);
    player.begin('whale', config); expect(player.lines(library.whale)).toEqual(['a', 'c']);
  });
  it('randomly samples without repeating entries, and supports zero', () => {
    const player = new PhrasePlayback(() => 0);
    player.begin('whale', { count: 3, mode: 'random', selectedIndices: [0, 1, 2, 3] });
    const selected = player.lines(library.whale); expect(selected).toHaveLength(3); expect(new Set(selected).size).toBe(3); expect(selected).not.toEqual(library.whale.slice(0, 3));
    player.begin('whale', { count: 0, mode: 'random', selectedIndices: [] }); expect(player.lines(library.whale)).toEqual([]);
  });
});
