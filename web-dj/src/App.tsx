import React, { useEffect, useMemo, useState } from 'react';
import { MixerEngine } from './audioEngine';
import { Deck } from './Deck';

export default function App() {
  const mixer = useMemo(() => new MixerEngine(), []);
  const [ready, setReady] = useState(false);
  const [master, setMaster] = useState(75);
  const [cross, setCross] = useState(50);
  const [, bump] = useState(0);

  useEffect(() => {
    mixer.ensureContext().then(() => setReady(true));
  }, [mixer]);

  const decks = mixer.getDecks();

  return (
    <div className="app">
      <header className="header">
        <h1>OpenDeck <span className="accent">Four</span></h1>
        <p>Web DJ — 4 decks · Web Audio API · EQ · crossfade</p>
        {!ready && <span className="hint">Click any control to unlock audio</span>}
      </header>

      <div className="decks-grid">
        {decks.map((d) => (
          <Deck key={d.id} deck={d} onUpdate={() => bump((n) => n + 1)} />
        ))}
      </div>

      <footer className="mixer">
        <div className="mixer-control">
          <label>Master Volume</label>
          <input
            type="range"
            min={0}
            max={100}
            value={master}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMaster(v);
              mixer.setMasterVolume(v / 100);
            }}
          />
          <span>{master}%</span>
        </div>
        <div className="mixer-control">
          <label>Crossfade</label>
          <input
            type="range"
            min={0}
            max={100}
            value={cross}
            onChange={(e) => {
              const v = Number(e.target.value);
              setCross(v);
              mixer.setCrossfade(v / 100);
            }}
          />
          <span>{cross}%</span>
        </div>
        <button
          className="unlock-btn"
          onClick={() => mixer.ensureContext().then(() => setReady(true))}
        >
          Unlock Audio
        </button>
      </footer>
    </div>
  );
}
