import React, { useEffect, useRef, useState } from 'react';
import type { DeckEngine } from './audioEngine';

function Waveform({ peaks, progress }: { peaks: number[]; progress: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const barW = w / peaks.length;
    peaks.forEach((p, i) => {
      const barH = p * h * 0.9;
      const x = i * barW;
      ctx.fillStyle = i / peaks.length < progress ? '#ff5a36' : '#3a3a42';
      ctx.fillRect(x, (h - barH) / 2, barW - 1, barH);
    });
    const px = progress * w;
    ctx.strokeStyle = '#f4f0ea';
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }, [peaks, progress]);

  return <canvas ref={canvasRef} className="waveform" width={280} height={48} />;
}

function VerticalSlider({
  label,
  min,
  max,
  value,
  onChange,
  compact,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  return (
    <div className={`vslider ${compact ? 'compact' : ''}`}>
      <label>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        orient="vertical"
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span>{value}</span>
    </div>
  );
}

export function Deck({
  deck,
  onUpdate,
}: {
  deck: DeckEngine;
  onUpdate: () => void;
}) {
  const [fileName, setFileName] = useState('');
  const [volume, setVolume] = useState(75);
  const [trim, setTrim] = useState(100);
  const [eq, setEq] = useState([0, 0, 0, 0, 0, 0]);
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (deck.isPlaying()) tick((n) => n + 1);
    }, 100);
    return () => clearInterval(id);
  }, [deck]);

  const duration = deck.getDuration();
  const current = deck.getCurrentTime();
  const progress = duration > 0 ? current / duration : 0;

  const loadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = await deck.loadFile(file);
    setFileName(name);
    onUpdate();
  };

  return (
    <section className="deck">
      <header className="deck-head">
        <span className="deck-label">{deck.label}</span>
        <span className="deck-file">{fileName || 'No media'}</span>
      </header>

      <input type="file" accept="audio/*" className="file-input" onChange={loadFile} />

      <Waveform peaks={deck.getPeaks()} progress={progress} />

      <div className="transport">
        <button onClick={() => { deck.play(); onUpdate(); }}>Play</button>
        <button onClick={() => { deck.pause(); onUpdate(); }}>Pause</button>
        <button onClick={() => { deck.stop(); onUpdate(); }}>Stop</button>
        <button onClick={() => { deck.seek(-5); onUpdate(); }}>-5s</button>
        <button onClick={() => { deck.seek(5); onUpdate(); }}>+5s</button>
      </div>

      <div className="time">
        {formatTime(current)} / {formatTime(duration)}
      </div>

      <div className="eq-row">
        {eq.map((v, i) => (
          <VerticalSlider
            key={i}
            label={`EQ${i + 1}`}
            min={-12}
            max={12}
            value={v}
            compact
            onChange={(val) => {
              setEq((prev) => {
                const next = [...prev];
                next[i] = val;
                return next;
              });
              deck.setEqBand(i, val);
            }}
          />
        ))}
      </div>

      <div className="dial-row">
        <VerticalSlider label="Vol" min={0} max={100} value={volume}
          onChange={(v) => { setVolume(v); deck.setVolume(v / 100); }} />
        <VerticalSlider label="Trim" min={50} max={150} value={trim}
          onChange={(v) => { setTrim(v); deck.setTrim(v / 100); }} />
      </div>
    </section>
  );
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
