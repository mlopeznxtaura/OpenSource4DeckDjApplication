import sys, os, json, math, tempfile, subprocess, threading, time
from dataclasses import dataclass, field
from pathlib import Path

from PySide6.QtCore import Qt, QUrl, QTimer
from PySide6.QtGui import QAction, QFont
from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer
from PySide6.QtMultimediaWidgets import QVideoWidget
from PySide6.QtWidgets import (
    QApplication, QComboBox, QDoubleSpinBox, QFileDialog, QGridLayout, QGroupBox,
    QHBoxLayout, QLabel, QLineEdit, QMainWindow, QPushButton, QSlider, QVBoxLayout,
    QWidget, QTabWidget, QMessageBox
)

try:
    import mido
except Exception:
    mido = None

try:
    import sounddevice as sd
except Exception:
    sd = None

try:
    import numpy as np
except Exception:
    np = None

try:
    import librosa
except Exception:
    librosa = None

APP_NAME = 'OpenDeck Four'

@dataclass
class DeckState:
    media_path: str = ''
    media_type: str = 'audio'
    player: QMediaPlayer = None
    audio_out: QAudioOutput = None
    video_widget: QVideoWidget = None
    video_on: bool = False
    tempo: float = 1.0
    eq: dict = field(default_factory=lambda: {f'band{i}': 0.0 for i in range(1,7)})
    effects: dict = field(default_factory=lambda: {'pitch':0.0,'echo':0.0,'delay':0.0,'spiral':0.0})
    trim: float = 1.0
    volume: float = 0.75
    cue_art: str = ''

class DeckWidget(QGroupBox):
    def __init__(self, idx, parent=None):
        super().__init__(f'Deck {idx+1}', parent)
        self.idx = idx
        self.state = DeckState()
        self._build()

    def _build(self):
        self.setStyleSheet('QGroupBox{font-weight:bold; border:1px solid #555; border-radius:10px; margin-top:8px;} QGroupBox::title{subcontrol-origin: margin; left:10px; padding:0 4px;}')
        lay = QVBoxLayout(self)
        row = QHBoxLayout()
        self.path = QLineEdit(); self.path.setReadOnly(True)
        btn = QPushButton('Load media')
        btn.clicked.connect(self.load_media)
        row.addWidget(self.path, 1); row.addWidget(btn)
        lay.addLayout(row)

        self.video = QVideoWidget()
        self.video.setMinimumHeight(180)
        lay.addWidget(self.video)

        grid = QGridLayout()
        self.play = QPushButton('Play')
        self.pause = QPushButton('Pause')
        self.stop = QPushButton('Stop')
        self.back5 = QPushButton('-5s')
        self.fwd5 = QPushButton('+5s')
        for b in [self.play, self.pause, self.stop, self.back5, self.fwd5]:
            b.setMinimumHeight(34)
        grid.addWidget(self.play,0,0); grid.addWidget(self.pause,0,1); grid.addWidget(self.stop,0,2)
        grid.addWidget(self.back5,1,0); grid.addWidget(self.fwd5,1,1)
        lay.addLayout(grid)

        self.volume = self._dial('Volume',0,100,75)
        self.trim = self._dial('Trim',0,200,100)
        self.pitch = self._dial('Pitch',-100,100,0)
        self.echo = self._dial('Echo',0,100,0)
        self.delay = self._dial('Delay',0,100,0)
        self.spiral = self._dial('Spiral',0,100,0)
        self.master = self._dial('Master',0,100,75)
        self.eq = []
        for i in range(1,7):
            self.eq.append(self._dial(f'EQ{i}',-12,12,0, compact=True))

        eq_row = QHBoxLayout()
        for d in self.eq:
            eq_row.addWidget(d['box'])
        lay.addLayout(eq_row)

        dial_row = QHBoxLayout()
        for d in [self.volume, self.trim, self.pitch, self.echo, self.delay, self.spiral, self.master]:
            dial_row.addWidget(d['box'])
        lay.addLayout(dial_row)

    def _dial(self, name, mn, mx, val, compact=False):
        box = QWidget(); l = QVBoxLayout(box); l.setContentsMargins(0,0,0,0)
        lbl = QLabel(name); lbl.setAlignment(Qt.AlignCenter)
        s = QSlider(Qt.Vertical); s.setRange(mn, mx); s.setValue(val)
        if compact: s.setMinimumHeight(110)
        else: s.setMinimumHeight(140)
        l.addWidget(lbl); l.addWidget(s)
        return {'box': box, 'slider': s}

    def load_media(self):
        f, _ = QFileDialog.getOpenFileName(self, 'Load media', '', 'Media Files (*.mp3 *.wav *.ogg *.m4a *.mp4 *.mov *.webm);;All Files (*)')
        if not f: return
        self.path.setText(f)
        self.state.media_path = f
        self.state.media_type = 'video' if Path(f).suffix.lower() in {'.mp4','.mov','.webm'} else 'audio'
        if self.state.player is None:
            self.state.player = QMediaPlayer(self)
            self.state.audio_out = QAudioOutput(self)
            self.state.player.setAudioOutput(self.state.audio_out)
            self.state.player.positionChanged.connect(self._sync_ui)
        self.state.player.setSource(QUrl.fromLocalFile(f))
        self.state.audio_out.setVolume(self.volume['slider'].value()/100)
        self.state.player.setPlaybackRate(self.trim['slider'].value()/100)
        if self.state.media_type == 'video':
            self.state.player.setVideoOutput(self.video)
            self.state.video_on = True
        else:
            self.state.player.setVideoOutput(None)
            self.state.video_on = False

        self.play.clicked.connect(self.state.player.play)
        self.pause.clicked.connect(self.state.player.pause)
        self.stop.clicked.connect(self.state.player.stop)
        self.back5.clicked.connect(lambda: self._seek(-5000))
        self.fwd5.clicked.connect(lambda: self._seek(5000))
        self.volume['slider'].valueChanged.connect(lambda v: self.state.audio_out.setVolume(v/100))
        self.trim['slider'].valueChanged.connect(lambda v: self.state.player.setPlaybackRate(v/100))

    def _seek(self, delta):
        if self.state.player: self.state.player.setPosition(max(0, self.state.player.position()+delta))
    def _sync_ui(self, *_): pass

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.resize(1600, 1100)
        root = QWidget(); self.setCentralWidget(root)
        lay = QVBoxLayout(root)
        title = QLabel('OpenDeck Four - open source DJ workstation prototype')
        title.setFont(QFont('Arial', 16, QFont.Bold))
        lay.addWidget(title)

        self.tabs = QTabWidget()
        self.decks = [DeckWidget(i) for i in range(4)]
        for d in self.decks: self.tabs.addTab(d, d.title())
        lay.addWidget(self.tabs, 1)

        controls = QHBoxLayout()
        self.master = QSlider(Qt.Horizontal); self.master.setRange(0,100); self.master.setValue(75)
        self.cross = QSlider(Qt.Horizontal); self.cross.setRange(0,100); self.cross.setValue(50)
        controls.addWidget(QLabel('Master Volume')); controls.addWidget(self.master,1)
        controls.addWidget(QLabel('Crossfade')); controls.addWidget(self.cross,1)
        lay.addLayout(controls)

        self.midi_status = QLabel('MIDI: disabled')
        self.load_midi = QPushButton('Connect MIDI')
        self.load_midi.clicked.connect(self.connect_midi)
        lay.addWidget(self.midi_status)
        lay.addWidget(self.load_midi)

        self.master.valueChanged.connect(self.apply_master)

    def apply_master(self, v):
        for d in self.decks:
            if d.state.audio_out: d.state.audio_out.setVolume(v/100)
    def connect_midi(self):
        if mido is None:
            QMessageBox.information(self, 'MIDI', 'mido not installed. MIDI is optional in this prototype.')
            return
        self.midi_status.setText('MIDI: ready for mapping')

if __name__ == '__main__':
    app = QApplication(sys.argv)
    w = MainWindow(); w.show()
    sys.exit(app.exec())
