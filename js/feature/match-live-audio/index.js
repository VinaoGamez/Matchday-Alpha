import { MODULE_VERSIONS } from '../../core/constants.js';

import whistleUrl from '../../../assets/sounds/match-live/whistle.mp3?url';
import goalCrowdUrl from '../../../assets/sounds/match-live/goal-crowd.mp3?url';
import penaltyMissCrowdUrl from '../../../assets/sounds/match-live/penalty-miss-crowd.mp3?url';
import stadiumAmbientUrl from '../../../assets/sounds/match-live/stadium-ambient.mp3?url';

const STORAGE_KEY = 'matchday-live-audio';
const GOAL_PLAY_MS = 2400;
const GOAL_FADE_MS = 650;
const CROWD_PLAY_MS = 2000;
const CROWD_FADE_MS = 500;

/** Ganho relativo ao volume master (níveis mais baixos). */
const CLIP_GAIN = {
  whistle: 0.15,
  goalCrowd: 0.52,
  penaltyMissCrowd: 0.48,
  stadiumAmbient: 0.12,
};

const CLIPS = {
  whistle: whistleUrl,
  goalCrowd: goalCrowdUrl,
  penaltyMissCrowd: penaltyMissCrowdUrl,
};

const loadSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: true, volume: 0.52 };
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false,
      volume: clampVolume(parsed.volume ?? 0.52),
    };
  } catch {
    return { enabled: true, volume: 0.52 };
  }
};

const clampVolume = value => Math.min(1, Math.max(0, Number(value) || 0));

/**
 * Sons da partida ao vivo — fila para apitos; gols em camadas paralelas.
 */
export function createMatchLiveAudioFeature() {
  let settings = loadSettings();
  let unlocked = false;
  let queue = [];
  let draining = false;
  let currentAudio = null;
  let currentClipKey = null;
  let currentStopTimer = null;
  let fadeTimer = null;
  let ambientAudio = null;
  let goalGeneration = 0;
  let goalLayers = [];

  const persistSettings = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  };

  const syncControls = () => {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-live-audio-mute]').forEach(btn => {
      const on = settings.enabled;
      btn.classList.toggle('is-muted', !on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? 'Silenciar sons da partida' : 'Ativar sons da partida');
      btn.title = on ? 'Silenciar sons' : 'Ativar sons';
    });
    const optionsToggle = document.querySelector('#liveAudioEnabled');
    if (optionsToggle) optionsToggle.checked = settings.enabled;
  };

  const clipVolume = clipKey => settings.volume * (CLIP_GAIN[clipKey] ?? 1);

  const ensureAmbient = () => {
    if (!ambientAudio) {
      ambientAudio = new Audio(stadiumAmbientUrl);
      ambientAudio.loop = true;
      ambientAudio.preload = 'auto';
    }
    ambientAudio.volume = clipVolume('stadiumAmbient');
    return ambientAudio;
  };

  const startStadiumAmbient = () => {
    if (!settings.enabled || !unlocked) return;
    ensureAmbient().play().catch(() => {});
  };

  const pauseStadiumAmbient = () => {
    ambientAudio?.pause();
  };

  const stopStadiumAmbient = () => {
    if (!ambientAudio) return;
    ambientAudio.pause();
    ambientAudio.currentTime = 0;
  };

  const syncAmbientVolume = () => {
    if (ambientAudio) ambientAudio.volume = clipVolume('stadiumAmbient');
  };

  const clearClipTimers = () => {
    if (currentStopTimer) {
      clearTimeout(currentStopTimer);
      currentStopTimer = null;
    }
    if (fadeTimer) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
  };

  const clearGoalLayerTimers = layer => {
    if (layer.stopTimer) {
      clearTimeout(layer.stopTimer);
      layer.stopTimer = null;
    }
    if (layer.fadeTimer) {
      clearInterval(layer.fadeTimer);
      layer.fadeTimer = null;
    }
  };

  const removeGoalLayer = layer => {
    clearGoalLayerTimers(layer);
    layer.audio.pause();
    layer.audio.currentTime = 0;
    goalLayers = goalLayers.filter(item => item !== layer);
  };

  const stopGoalLayers = ({ fadeLatest = false } = {}) => {
    if (!goalLayers.length) return;
    if (fadeLatest && goalLayers.length === 1) {
      fadeGoalLayer(goalLayers[0]);
      return;
    }
    [...goalLayers].forEach(removeGoalLayer);
  };

  const fadeGoalLayer = layer => {
    if (!layer || layer.fading) return;
    layer.fading = true;
    clearGoalLayerTimers(layer);
    const peakVol = layer.peakVol;
    const steps = Math.max(4, Math.round(GOAL_FADE_MS / 50));
    let step = 0;
    layer.fadeTimer = setInterval(() => {
      step += 1;
      layer.audio.volume = Math.max(0, peakVol * (1 - step / steps));
      if (step >= steps) {
        removeGoalLayer(layer);
      }
    }, GOAL_FADE_MS / steps);
  };

  const stopCurrent = () => {
    clearClipTimers();
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
    currentClipKey = null;
  };

  const playClip = (clipKey, { maxDurationMs, fadeOutMs, onStart } = {}) =>
    new Promise(resolve => {
      if (!settings.enabled || !unlocked) {
        resolve();
        return;
      }
      const url = CLIPS[clipKey];
      if (!url) {
        resolve();
        return;
      }
      stopCurrent();
      currentClipKey = clipKey;
      const audio = new Audio(url);
      audio.preload = 'auto';
      const peakVol = clipVolume(clipKey);
      audio.volume = peakVol;
      currentAudio = audio;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearClipTimers();
        if (currentAudio === audio) {
          currentAudio = null;
          currentClipKey = null;
        }
        resolve();
      };
      audio.addEventListener('ended', finish, { once: true });
      audio.addEventListener('error', finish, { once: true });
      if (maxDurationMs && fadeOutMs && fadeOutMs > 0) {
        const fadeStart = Math.max(0, maxDurationMs - fadeOutMs);
        currentStopTimer = setTimeout(() => {
          const steps = Math.max(4, Math.round(fadeOutMs / 50));
          let step = 0;
          fadeTimer = setInterval(() => {
            step += 1;
            audio.volume = Math.max(0, peakVol * (1 - step / steps));
            if (step >= steps) {
              clearInterval(fadeTimer);
              fadeTimer = null;
              audio.pause();
              finish();
            }
          }, fadeOutMs / steps);
        }, fadeStart);
      } else if (maxDurationMs) {
        currentStopTimer = setTimeout(() => {
          audio.pause();
          finish();
        }, maxDurationMs);
      }
      onStart?.();
      audio.play().catch(finish);
    });

  const drainQueue = async () => {
    if (draining) return;
    draining = true;
    while (queue.length) {
      const job = queue.shift();
      await job();
    }
    draining = false;
  };

  const enqueue = job =>
    new Promise(resolve => {
      queue.push(async () => {
        await job();
        resolve();
      });
      drainQueue();
    });

  const playWhistleReady = () => {
    let resolveWhistle = () => {};
    const ready = new Promise(resolve => {
      resolveWhistle = resolve;
    });
    enqueue(async () => {
      resolveWhistle();
      await playClip('whistle');
    });
    return ready;
  };

  const playKickoff = () => playWhistleReady();
  const playSecondHalf = () => playWhistleReady();
  const playResumeWhistle = () => playWhistleReady();
  const playStopWhistle = () => enqueue(() => playClip('whistle'));
  const playHalftime = () => enqueue(() => playClip('whistle'));
  const playFulltime = () => enqueue(() => playClip('whistle'));
  const playPenaltyKick = () => enqueue(() => playClip('whistle'));

  /** Gols em paralelo; só o último da sequência encerra com fade. */
  const playGoal = () => {
    if (!settings.enabled || !unlocked) return;
    goalGeneration += 1;
    const generation = goalGeneration;

    goalLayers.forEach(layer => {
      if (layer.generation !== generation) removeGoalLayer(layer);
    });

    const audio = new Audio(goalCrowdUrl);
    audio.preload = 'auto';
    const peakVol = clipVolume('goalCrowd');
    audio.volume = peakVol;

    const layer = {
      audio,
      generation,
      peakVol,
      fading: false,
      stopTimer: null,
      fadeTimer: null,
    };
    goalLayers.push(layer);

    audio.play().catch(() => removeGoalLayer(layer));

    layer.stopTimer = setTimeout(() => {
      if (generation !== goalGeneration) {
        removeGoalLayer(layer);
        return;
      }
      fadeGoalLayer(layer);
    }, Math.max(0, GOAL_PLAY_MS - GOAL_FADE_MS));
  };

  const playPenaltyMiss = () => {
    enqueue(() =>
      playClip('penaltyMissCrowd', {
        maxDurationMs: CROWD_PLAY_MS,
        fadeOutMs: CROWD_FADE_MS,
      }),
    );
  };

  return {
    moduleVersion: MODULE_VERSIONS.matchLiveAudio,
    unlock: () => {
      unlocked = true;
      if (!settings.enabled) return;
      const audio = new Audio(whistleUrl);
      audio.volume = 0;
      audio.play().catch(() => {});
    },
    stopAll: () => {
      queue = [];
      stopCurrent();
      stopGoalLayers();
      stopStadiumAmbient();
    },
    isEnabled: () => settings.enabled,
    getVolume: () => settings.volume,
    setEnabled: enabled => {
      settings.enabled = !!enabled;
      if (!settings.enabled) {
        queue = [];
        stopCurrent();
        stopGoalLayers();
        stopStadiumAmbient();
      }
      persistSettings();
      syncControls();
    },
    setVolume: volume => {
      settings.volume = clampVolume(volume);
      if (currentAudio && currentClipKey) currentAudio.volume = clipVolume(currentClipKey);
      goalLayers.forEach(layer => {
        if (!layer.fading) layer.audio.volume = clipVolume('goalCrowd');
        layer.peakVol = clipVolume('goalCrowd');
      });
      syncAmbientVolume();
      persistSettings();
    },
    renderOptions: root => {
      if (!root) return;
      root.innerHTML = `
        <label class="live-audio-toggle">
          <input id="liveAudioEnabled" type="checkbox"${settings.enabled ? ' checked' : ''}>
          <span>Ativar sons da partida ao vivo</span>
        </label>
        <label class="live-audio-volume" for="liveAudioVolume">
          <span>Volume</span>
          <input id="liveAudioVolume" type="range" min="0" max="100" step="5" value="${Math.round(settings.volume * 100)}">
        </label>`;
      root.querySelector('#liveAudioEnabled')?.addEventListener('change', event => {
        settings.enabled = event.target.checked;
        if (!settings.enabled) {
          queue = [];
          stopCurrent();
          stopGoalLayers();
          stopStadiumAmbient();
        }
        persistSettings();
        syncControls();
      });
      root.querySelector('#liveAudioVolume')?.addEventListener('input', event => {
        settings.volume = clampVolume(Number(event.target.value) / 100);
        if (currentAudio && currentClipKey) currentAudio.volume = clipVolume(currentClipKey);
        goalLayers.forEach(layer => {
          if (!layer.fading) layer.audio.volume = clipVolume('goalCrowd');
          layer.peakVol = clipVolume('goalCrowd');
        });
        syncAmbientVolume();
        persistSettings();
      });
      syncControls();
    },
    syncControls,
    playKickoff,
    playSecondHalf,
    playStopWhistle,
    playResumeWhistle,
    playHalftime,
    playFulltime,
    playPenaltyKick,
    playGoal,
    playPenaltyMiss,
    startStadiumAmbient,
    pauseStadiumAmbient,
    stopStadiumAmbient,
  };
}
