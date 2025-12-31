/**
 * OpenTranscriber v7 - Production-ready version
 * 
 * A standalone, browser-based transcription tool for linguists.
 * Designed as a modern replacement for Transcriber.
 * 
 * Features:
 * - Multi-speaker tracks with synchronized waveforms
 * - Speaker filtering on master track (for overlapping speech)
 * - Mouse drag selection for segment creation
 * - Loop playback for selected segments
 * - High-pass/low-pass audio filters
 * - Undo/Redo support (Ctrl+Z / Ctrl+Y)
 * - JSON project save/load with timestamps
 * - Multi-format export (ELAN .eaf, SRT, Praat TextGrid, JSON, CSV)
 * 
 * @author OpenTranscriber Project
 * @version 7.0.0
 * @license MIT
 */

'use strict';

class OpenTranscriber {
    constructor() {
        console.log('🚀 OpenTranscriber v7 initialisation...');
        
        // Core state
        this.masterWave = null;
        this.masterRegions = null;
        this.masterSpectrogram = null;
        this.masterTimeline = null;
        this.speakerTracks = [];
        this.segments = [];
        this.selectedSegment = null;
        this.audioFile = null;
        this.audioFileName = null;
        this.audioBuffer = null;
        
        // Audio filters
        this.audioContext = null;
        this.highpassFilter = null;
        this.lowpassFilter = null;
        
        // Manual segmentation state
        this.isMarking = false;
        this.markStartTime = null;
        
        // Loop playback
        this.loopEnabled = true;
        this.activeRegion = null;
        this.isPlayingSegment = false;
        
        // Speaker filter display
        this.visibleSpeaker = 'all';
        
        // Undo/Redo history
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistorySize = 50;
        
        // Speaker colors (colorblind-friendly palette)
        this.speakerColors = [
            { bg: 'rgba(239, 83, 80, 0.5)', border: '#ef5350' },   // Red
            { bg: 'rgba(102, 187, 106, 0.5)', border: '#66bb6a' }, // Green
            { bg: 'rgba(66, 165, 245, 0.5)', border: '#42a5f5' },  // Blue
            { bg: 'rgba(255, 238, 88, 0.5)', border: '#ffee58' },  // Yellow
            { bg: 'rgba(171, 71, 188, 0.5)', border: '#ab47bc' },  // Purple
            { bg: 'rgba(255, 167, 38, 0.5)', border: '#ffa726' },  // Orange
            { bg: 'rgba(38, 166, 154, 0.5)', border: '#26a69a' },  // Teal
            { bg: 'rgba(236, 64, 122, 0.5)', border: '#ec407a' }   // Pink
        ];
        
        this.init();
    }
    
    init() {
        this.initMasterWaveSurfer();
        this.initEventListeners();
        this.initKeyboardShortcuts();
        this.createDefaultSpeakers();
        console.log('✅ OpenTranscriber v7 ready');
    }
    
    // ========================================================================
    // UNDO / REDO SYSTEM
    // ========================================================================
    
    /**
     * Save current state to undo stack
     * @param {string} actionName - Description of the action for debugging
     */
    saveState(actionName = 'action') {
        const state = {
            action: actionName,
            timestamp: Date.now(),
            segments: this.segments.map(s => ({
                id: s.id,
                start: s.start,
                end: s.end,
                speaker: s.speaker,
                transcription: s.transcription
            })),
            speakers: this.speakerTracks.map(t => ({
                id: t.speakerNum,
                name: t.name
            }))
        };
        
        this.undoStack.push(state);
        
        // Limit stack size
        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }
        
        // Clear redo stack on new action
        this.redoStack = [];
        
        this.updateUndoRedoButtons();
        console.log(`📝 State saved: ${actionName} (${this.undoStack.length} states in history)`);
    }
    
    /**
     * Undo last action
     */
    undo() {
        if (this.undoStack.length === 0) {
            this.showToast('Nothing to undo', 'info');
            return;
        }
        
        // Save current state to redo stack
        const currentState = {
            action: 'before_undo',
            timestamp: Date.now(),
            segments: this.segments.map(s => ({
                id: s.id,
                start: s.start,
                end: s.end,
                speaker: s.speaker,
                transcription: s.transcription
            })),
            speakers: this.speakerTracks.map(t => ({
                id: t.speakerNum,
                name: t.name
            }))
        };
        this.redoStack.push(currentState);
        
        // Restore previous state
        const previousState = this.undoStack.pop();
        this.restoreState(previousState);
        
        this.updateUndoRedoButtons();
        this.showToast(`Undo: ${previousState.action}`, 'info');
    }
    
    /**
     * Redo last undone action
     */
    redo() {
        if (this.redoStack.length === 0) {
            this.showToast('Nothing to redo', 'info');
            return;
        }
        
        // Save current state to undo stack
        const currentState = {
            action: 'before_redo',
            timestamp: Date.now(),
            segments: this.segments.map(s => ({
                id: s.id,
                start: s.start,
                end: s.end,
                speaker: s.speaker,
                transcription: s.transcription
            })),
            speakers: this.speakerTracks.map(t => ({
                id: t.speakerNum,
                name: t.name
            }))
        };
        this.undoStack.push(currentState);
        
        // Restore redo state
        const redoState = this.redoStack.pop();
        this.restoreState(redoState);
        
        this.updateUndoRedoButtons();
        this.showToast('Redo applied', 'info');
    }
    
    /**
     * Restore application state from a saved state object
     */
    restoreState(state) {
        // Close editor if open
        this.closeEditor();
        
        // Restore segments
        this.segments = state.segments.map(s => ({
            id: s.id,
            start: s.start,
            end: s.end,
            speaker: s.speaker,
            transcription: s.transcription,
            color: this.speakerColors[(s.speaker - 1) % this.speakerColors.length]
        }));
        
        // Restore speaker names
        state.speakers.forEach(spk => {
            const track = this.speakerTracks.find(t => t.speakerNum === spk.id);
            if (track) {
                track.name = spk.name;
                track.container.querySelector('.speaker-name').value = spk.name;
            }
        });
        
        // Redraw all segments
        this.redrawAllSegments();
        this.updateSpeakerSelect();
        this.updateSpeakerFilterButtons();
    }
    
    /**
     * Update undo/redo button states
     */
    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        if (undoBtn) {
            undoBtn.disabled = this.undoStack.length === 0;
            undoBtn.title = this.undoStack.length > 0 
                ? `Undo (${this.undoStack.length})` 
                : 'Nothing to undo';
        }
        
        if (redoBtn) {
            redoBtn.disabled = this.redoStack.length === 0;
            redoBtn.title = this.redoStack.length > 0 
                ? `Redo (${this.redoStack.length})` 
                : 'Nothing to redo';
        }
    }
    
    /**
     * Clear all history (call when loading new audio)
     */
    clearHistory() {
        this.undoStack = [];
        this.redoStack = [];
        this.updateUndoRedoButtons();
    }
    
    // ========================================================================
    // WAVESURFER MASTER
    // ========================================================================
    
    initMasterWaveSurfer() {
        this.masterWave = WaveSurfer.create({
            container: '#waveform',
            waveColor: '#4a90e2',
            progressColor: '#2c5aa0',
            cursorColor: '#e74c3c',
            barWidth: 2,
            barGap: 1,
            height: 128,
            normalize: true,
            minPxPerSec: 50
        });
        
        // Plugins
        this.masterRegions = this.masterWave.registerPlugin(WaveSurfer.Regions.create());
        
        this.masterTimeline = this.masterWave.registerPlugin(WaveSurfer.Timeline.create({
            height: 20,
            insertPosition: 'beforebegin'
        }));
        
        // Spectrogramme (formants) - affiché par défaut avec opacité réduite
        this.masterSpectrogram = this.masterWave.registerPlugin(WaveSurfer.Spectrogram.create({
            container: '#spectrogram',
            labels: true,
            height: 128
        }));
        
        // Activer la sélection à la souris pour créer des segments
        this.masterRegions.enableDragSelection({
            color: 'rgba(66, 153, 225, 0.3)'
        });
        
        // Événements
        this.masterWave.on('ready', () => this.onAudioReady());
        this.masterWave.on('timeupdate', (t) => this.onTimeUpdate(t));
        this.masterWave.on('play', () => { document.getElementById('playBtn').textContent = '⏸'; });
        this.masterWave.on('pause', () => { document.getElementById('playBtn').textContent = '▶'; });
        
        // Événements régions
        this.masterRegions.on('region-created', (r) => this.onRegionCreated(r));
        this.masterRegions.on('region-updated', (r) => this.onRegionUpdated(r));
        this.masterRegions.on('region-clicked', (r, e) => this.selectSegmentByRegion(r, e));
        
        // Double-clic sur région pour éditer
        this.masterRegions.on('region-double-clicked', (r) => this.openInlineEditor(r));
        
        // Événements pour la lecture en boucle
        this.masterRegions.on('region-in', (region) => {
            this.activeRegion = region;
        });
        
        this.masterRegions.on('region-out', (region) => {
            if (this.activeRegion === region && this.isPlayingSegment) {
                if (this.loopEnabled) {
                    region.play();
                } else {
                    this.isPlayingSegment = false;
                    this.masterWave.pause();
                }
            }
        });
        
        // Clic sur waveform = réinitialiser la région active
        this.masterWave.on('interaction', () => {
            if (!this.isPlayingSegment) {
                this.activeRegion = null;
            }
        });
    }
    
    // ========================================================================
    // FILTRES AUDIO
    // ========================================================================
    
    initAudioFilters() {
        if (!this.masterWave || !this.masterWave.getMediaElement()) return;
        
        try {
            // Créer le contexte audio s'il n'existe pas
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            const mediaElement = this.masterWave.getMediaElement();
            const source = this.audioContext.createMediaElementSource(mediaElement);
            
            // Créer les filtres
            this.highpassFilter = this.audioContext.createBiquadFilter();
            this.highpassFilter.type = 'highpass';
            this.highpassFilter.frequency.value = 0;
            
            this.lowpassFilter = this.audioContext.createBiquadFilter();
            this.lowpassFilter.type = 'lowpass';
            this.lowpassFilter.frequency.value = 20000;
            
            // Connecter: source -> highpass -> lowpass -> destination
            source.connect(this.highpassFilter);
            this.highpassFilter.connect(this.lowpassFilter);
            this.lowpassFilter.connect(this.audioContext.destination);
            
            console.log('✅ Filtres audio initialisés');
        } catch (error) {
            console.warn('⚠️ Impossible d\'initialiser les filtres audio:', error);
        }
    }
    
    setHighpassFrequency(freq) {
        if (this.highpassFilter) {
            this.highpassFilter.frequency.value = freq;
        }
    }
    
    setLowpassFrequency(freq) {
        if (this.lowpassFilter) {
            this.lowpassFilter.frequency.value = freq;
        }
    }
    
    resetFilters() {
        document.getElementById('highpassSlider').value = 0;
        document.getElementById('lowpassSlider').value = 20000;
        document.getElementById('highpassValue').textContent = '0 Hz';
        document.getElementById('lowpassValue').textContent = '20k Hz';
        
        this.setHighpassFrequency(0);
        this.setLowpassFrequency(20000);
        
        this.showToast('Filtres réinitialisés', 'info');
    }
    
    // ========================================================================
    // CHARGEMENT AUDIO
    // ========================================================================
    
    loadAudioFile(file) {
        this.audioFile = file;
        this.audioFileName = file.name;
        this.showToast(`Chargement de ${file.name}...`, 'info');
        this.masterWave.loadBlob(file);
    }
    
    onAudioReady() {
        console.log('✅ Audio ready');
        this.audioBuffer = this.masterWave.getDecodedData();
        
        const duration = this.masterWave.getDuration();
        document.getElementById('totalDuration').textContent = this.formatTime(duration);
        
        // Enable buttons
        document.getElementById('autoSegBtn').disabled = false;
        document.getElementById('exportBtn').disabled = false;
        
        // Initialize audio filters
        this.initAudioFilters();
        
        // Create waveforms for speaker tracks
        this.speakerTracks.forEach(track => track.loadAudio(this.audioFile));
        
        this.showToast('Audio loaded!', 'success');
    }
    
    onTimeUpdate(time) {
        document.getElementById('currentTime').textContent = this.formatTime(time);
        
        // Synchroniser les pistes locuteurs
        this.speakerTracks.forEach(track => {
            if (track.wave) {
                track.wave.setTime(time);
            }
        });
    }
    
    // ========================================================================
    // RÉGION CRÉÉE PAR DRAG SELECTION
    // ========================================================================
    
    onRegionCreated(region) {
        // Vérifier si c'est une nouvelle région créée par drag selection
        // (pas une région qu'on a nous-même créée via createSegment)
        const existingSegment = this.segments.find(s => s.id === region.id);
        
        if (!existingSegment && region.end - region.start > 0.1) {
            // Save state before creating
            this.saveState('create segment (drag)');
            
            // C'est une nouvelle région créée par l'utilisateur
            const speakerNum = this.getDefaultSpeakerForNewSegment();
            
            const segment = {
                id: region.id,
                start: region.start,
                end: region.end,
                speaker: speakerNum,
                transcription: '',
                color: this.speakerColors[(speakerNum - 1) % this.speakerColors.length]
            };
            
            this.segments.push(segment);
            
            // Mettre à jour la couleur de la région
            region.setOptions({
                color: segment.color.bg,
                drag: true,
                resize: true
            });
            
            // Ajouter sur piste locuteur
            const track = this.speakerTracks.find(t => t.speakerNum === speakerNum);
            if (track) {
                track.addSegment(segment);
            }
            
            // Sélectionner le segment
            this.selectSegment(segment);
            
            this.showToast('Segment created', 'success');
        }
    }
    
    getDefaultSpeakerForNewSegment() {
        // Si un filtre de locuteur est actif, utiliser ce locuteur
        if (this.visibleSpeaker !== 'all') {
            return parseInt(this.visibleSpeaker);
        }
        return 1;
    }
    
    // ========================================================================
    // PISTES LOCUTEURS
    // ========================================================================
    
    createDefaultSpeakers() {
        for (let i = 0; i < 3; i++) {
            this.addSpeaker();
        }
    }
    
    addSpeaker() {
        const speakerNum = this.speakerTracks.length + 1;
        const color = this.speakerColors[(speakerNum - 1) % this.speakerColors.length];
        
        const track = new SpeakerTrack(speakerNum, color, this);
        this.speakerTracks.push(track);
        
        // Si audio déjà chargé, charger dans cette piste
        if (this.audioFile) {
            track.loadAudio(this.audioFile);
        }
        
        // Mettre à jour le select et les boutons radio
        this.updateSpeakerSelect();
        this.updateSpeakerFilterButtons();
    }
    
    removeSpeaker(speakerNum) {
        const index = this.speakerTracks.findIndex(t => t.speakerNum === speakerNum);
        if (index !== -1) {
            // Supprimer les segments de ce locuteur
            this.segments = this.segments.filter(s => s.speaker !== speakerNum);
            
            // Détruire la piste
            this.speakerTracks[index].destroy();
            this.speakerTracks.splice(index, 1);
            
            // Renuméroter
            this.speakerTracks.forEach((t, idx) => {
                t.updateNumber(idx + 1);
            });
            
            this.redrawAllSegments();
            this.updateSpeakerSelect();
            this.updateSpeakerFilterButtons();
        }
    }
    
    updateSpeakerSelect() {
        const select = document.getElementById('speakerSelect');
        select.innerHTML = '';
        
        this.speakerTracks.forEach(track => {
            const option = document.createElement('option');
            option.value = track.speakerNum;
            option.textContent = track.name;
            select.appendChild(option);
        });
    }
    
    updateSpeakerFilterButtons() {
        const container = document.getElementById('speakerRadioButtons');
        container.innerHTML = '';
        
        this.speakerTracks.forEach(track => {
            const label = document.createElement('label');
            label.className = `radio-pill spk${track.speakerNum}`;
            
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'speakerFilter';
            input.value = track.speakerNum;
            
            const span = document.createElement('span');
            span.textContent = track.name;
            
            label.appendChild(input);
            label.appendChild(span);
            container.appendChild(label);
            
            input.addEventListener('change', () => {
                this.filterSegmentsBySpeaker(track.speakerNum);
            });
        });
    }
    
    filterSegmentsBySpeaker(speakerNum) {
        this.visibleSpeaker = speakerNum;
        
        // Parcourir toutes les régions sur le master
        const regions = this.masterRegions.getRegions();
        
        regions.forEach(region => {
            const segment = this.segments.find(s => s.id === region.id);
            if (segment) {
                if (speakerNum === 'all' || segment.speaker === parseInt(speakerNum)) {
                    region.element.style.display = 'block';
                } else {
                    region.element.style.display = 'none';
                }
            }
        });
        
        const label = speakerNum === 'all' ? 'all speakers' : `Speaker ${speakerNum}`;
        this.showToast(`Showing: ${label}`, 'info');
    }
    
    // ========================================================================
    // GESTION DES SEGMENTS
    // ========================================================================
    
    createSegment(start, end, speakerNum, transcription = '') {
        const id = `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const segment = {
            id,
            start,
            end,
            speaker: speakerNum,
            transcription,
            color: this.speakerColors[(speakerNum - 1) % this.speakerColors.length]
        };
        
        this.segments.push(segment);
        
        // Créer région sur master
        this.masterRegions.addRegion({
            id,
            start,
            end,
            color: segment.color.bg,
            drag: true,
            resize: true
        });
        
        // Ajouter sur piste locuteur
        const track = this.speakerTracks.find(t => t.speakerNum === speakerNum);
        if (track) {
            track.addSegment(segment);
        }
        
        return segment;
    }
    
    selectSegmentByRegion(region, event) {
        event.stopPropagation();
        const segment = this.segments.find(s => s.id === region.id);
        if (segment) {
            this.selectSegment(segment);
        }
    }
    
    selectSegment(segment) {
        this.selectedSegment = segment;
        
        // Mettre à jour UI
        document.getElementById('segmentTimeInfo').textContent = 
            `${this.formatTime(segment.start)} → ${this.formatTime(segment.end)} (${(segment.end - segment.start).toFixed(2)}s)`;
        
        document.getElementById('speakerSelect').value = segment.speaker;
        document.getElementById('transcriptionInput').value = segment.transcription || '';
        
        // Afficher le panel d'édition
        document.getElementById('editionPanel').classList.remove('hidden');
        
        // Focus automatique dans l'input de transcription
        setTimeout(() => {
            document.getElementById('transcriptionInput').focus();
        }, 100);
        
        // Highlight visuel
        this.highlightSegment(segment.id);
    }
    
    highlightSegment(segmentId) {
        // Retirer highlights existants
        document.querySelectorAll('.segment-highlighted').forEach(el => {
            el.classList.remove('segment-highlighted');
        });
        
        if (!segmentId) return;
        
        // Ajouter highlight
        const regions = this.masterRegions.getRegions();
        const masterRegion = regions.find(r => r.id === segmentId);
        if (masterRegion && masterRegion.element) {
            masterRegion.element.classList.add('segment-highlighted');
        }
    }
    
    openInlineEditor(region) {
        const segment = this.segments.find(s => s.id === region.id);
        if (segment) {
            this.selectSegment(segment);
            document.getElementById('transcriptionInput').select();
        }
    }
    
    saveTranscription() {
        if (!this.selectedSegment) return;
        
        const text = document.getElementById('transcriptionInput').value;
        this.selectedSegment.transcription = text;
        
        // Mettre à jour visuel sur piste locuteur
        const track = this.speakerTracks.find(t => t.speakerNum === this.selectedSegment.speaker);
        if (track) {
            track.updateSegmentVisual(this.selectedSegment);
        }
        
        this.showToast('Transcription saved', 'success');
    }
    
    deleteSegment() {
        if (!this.selectedSegment) return;
        
        // Save state before deleting
        this.saveState('delete segment');
        
        const id = this.selectedSegment.id;
        
        // Retirer du tableau
        this.segments = this.segments.filter(s => s.id !== id);
        
        // Retirer de master
        const regions = this.masterRegions.getRegions();
        const masterRegion = regions.find(r => r.id === id);
        if (masterRegion) {
            masterRegion.remove();
        }
        
        // Retirer de piste locuteur
        const track = this.speakerTracks.find(t => t.speakerNum === this.selectedSegment.speaker);
        if (track) {
            track.removeSegment(id);
        }
        
        this.closeEditor();
        this.showToast('Segment deleted', 'info');
    }
    
    closeEditor() {
        this.selectedSegment = null;
        document.getElementById('editionPanel').classList.add('hidden');
        this.highlightSegment(null);
    }
    
    moveSegmentToSpeaker(direction) {
        if (!this.selectedSegment) return;
        
        const currentSpeaker = this.selectedSegment.speaker;
        const newSpeaker = Math.max(1, Math.min(this.speakerTracks.length, currentSpeaker + direction));
        
        if (newSpeaker !== currentSpeaker) {
            // Save state before changing speaker
            this.saveState('change speaker');
            
            // Retirer de l'ancienne piste
            const oldTrack = this.speakerTracks.find(t => t.speakerNum === currentSpeaker);
            if (oldTrack) {
                oldTrack.removeSegment(this.selectedSegment.id);
            }
            
            // Changer le speaker
            this.selectedSegment.speaker = newSpeaker;
            this.selectedSegment.color = this.speakerColors[(newSpeaker - 1) % this.speakerColors.length];
            
            // Ajouter à la nouvelle piste
            const newTrack = this.speakerTracks.find(t => t.speakerNum === newSpeaker);
            if (newTrack) {
                newTrack.addSegment(this.selectedSegment);
            }
            
            // Mettre à jour couleur sur master
            const regions = this.masterRegions.getRegions();
            const masterRegion = regions.find(r => r.id === this.selectedSegment.id);
            if (masterRegion) {
                masterRegion.setOptions({ color: this.selectedSegment.color.bg });
            }
            
            // Mettre à jour UI
            document.getElementById('speakerSelect').value = newSpeaker;
            this.showToast(`Assigned to ${newTrack.name}`, 'info');
        }
    }
    
    onRegionUpdated(region) {
        const segment = this.segments.find(s => s.id === region.id);
        if (segment) {
            segment.start = region.start;
            segment.end = region.end;
            
            // Mettre à jour sur piste locuteur
            const track = this.speakerTracks.find(t => t.speakerNum === segment.speaker);
            if (track) {
                track.updateSegmentPosition(segment);
            }
            
            // Mettre à jour l'info si sélectionné
            if (this.selectedSegment && this.selectedSegment.id === segment.id) {
                document.getElementById('segmentTimeInfo').textContent = 
                    `${this.formatTime(segment.start)} → ${this.formatTime(segment.end)} (${(segment.end - segment.start).toFixed(2)}s)`;
            }
        }
    }
    
    redrawAllSegments() {
        // Vider master
        this.masterRegions.clearRegions();
        
        // Vider pistes
        this.speakerTracks.forEach(t => t.clearSegments());
        
        // Redessiner
        this.segments.forEach(seg => {
            this.masterRegions.addRegion({
                id: seg.id,
                start: seg.start,
                end: seg.end,
                color: seg.color.bg,
                drag: true,
                resize: true
            });
            
            const track = this.speakerTracks.find(t => t.speakerNum === seg.speaker);
            if (track) {
                track.addSegment(seg);
            }
        });
    }
    
    // ========================================================================
    // LECTURE EN BOUCLE DU SEGMENT
    // ========================================================================
    
    playSelectedSegment() {
        if (!this.selectedSegment) return;
        
        const regions = this.masterRegions.getRegions();
        const region = regions.find(r => r.id === this.selectedSegment.id);
        
        if (region) {
            this.isPlayingSegment = true;
            this.activeRegion = region;
            region.play();
        }
    }
    
    toggleLoop() {
        this.loopEnabled = !this.loopEnabled;
        document.getElementById('loopToggle').checked = this.loopEnabled;
        this.showToast(this.loopEnabled ? 'Boucle activée' : 'Boucle désactivée', 'info');
    }
    
    // ========================================================================
    // SEGMENTATION À LA VOLÉE
    // ========================================================================
    
    toggleMarking() {
        if (!this.isMarking) {
            // Début du marquage
            this.markStartTime = this.masterWave.getCurrentTime();
            this.isMarking = true;
            this.showToast(`Start marked at ${this.formatTime(this.markStartTime)}`, 'info');
        } else {
            // Fin du marquage
            const endTime = this.masterWave.getCurrentTime();
            
            if (endTime > this.markStartTime) {
                // Save state before creating segment
                this.saveState('create segment (S key)');
                
                // Créer segment (locuteur selon filtre actif ou 1 par défaut)
                const speakerNum = this.getDefaultSpeakerForNewSegment();
                this.createSegment(this.markStartTime, endTime, speakerNum);
                this.showToast('Segment created!', 'success');
            }
            
            this.isMarking = false;
            this.markStartTime = null;
        }
    }
    
    // ========================================================================
    // SAUVEGARDE ET IMPORT JSON
    // ========================================================================
    
    saveProject() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseName = this.audioFileName ? this.audioFileName.replace(/\.[^/.]+$/, '') : 'project';
        
        const project = {
            version: '7.0',
            savedAt: new Date().toISOString(),
            audio: {
                filename: this.audioFileName || '',
                duration: this.masterWave?.getDuration() || 0
            },
            speakers: this.speakerTracks.map(t => ({
                id: t.speakerNum,
                name: t.name
            })),
            segments: this.segments.map(s => ({
                id: s.id,
                start: s.start,
                end: s.end,
                speaker: s.speaker,
                transcription: s.transcription || ''
            }))
        };
        
        const filename = `${baseName}_${timestamp}.json`;
        this.downloadFile(filename, JSON.stringify(project, null, 2), 'application/json');
        this.showToast(`Project saved: ${filename}`, 'success');
    }
    
    importProject(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const project = JSON.parse(e.target.result);
                
                // Validate format
                if (!project.version || !project.segments) {
                    throw new Error('Invalid file format');
                }
                
                // Save state before import
                this.saveState('before import');
                
                // Import speakers
                if (project.speakers && project.speakers.length > 0) {
                    // Remove existing tracks
                    while (this.speakerTracks.length > 0) {
                        this.speakerTracks[0].destroy();
                        this.speakerTracks.shift();
                    }
                    
                    // Create new tracks
                    project.speakers.forEach(spk => {
                        const color = this.speakerColors[(spk.id - 1) % this.speakerColors.length];
                        const track = new SpeakerTrack(spk.id, color, this);
                        track.name = spk.name;
                        track.container.querySelector('.speaker-name').value = spk.name;
                        this.speakerTracks.push(track);
                        
                        if (this.audioFile) {
                            track.loadAudio(this.audioFile);
                        }
                    });
                    
                    this.updateSpeakerSelect();
                    this.updateSpeakerFilterButtons();
                }
                
                // Clear existing segments
                this.segments = [];
                this.masterRegions.clearRegions();
                this.speakerTracks.forEach(t => t.clearSegments());
                
                // Import segments
                project.segments.forEach(seg => {
                    this.createSegment(seg.start, seg.end, seg.speaker, seg.transcription);
                });
                
                this.showToast(`Project imported: ${project.segments.length} segments`, 'success');
                
                // Avertir si l'audio ne correspond pas
                if (project.audio && project.audio.filename && this.audioFileName) {
                    if (project.audio.filename !== this.audioFileName) {
                        this.showToast(`⚠️ Audio différent: ${project.audio.filename}`, 'info');
                    }
                }
                
            } catch (error) {
                console.error('Import error:', error);
                this.showToast('Error: invalid file', 'danger');
            }
        };
        
        reader.readAsText(file);
    }
    
    // ========================================================================
    // SEGMENTATION AUTOMATIQUE (MULTI-STRATÉGIES)
    // ========================================================================
    
    openAutoSegModal() {
        document.getElementById('autoSegModal').classList.add('active');
    }
    
    closeAutoSegModal() {
        document.getElementById('autoSegModal').classList.remove('active');
    }
    
    async autoSegment() {
        const strategy = document.getElementById('segmentationStrategy')?.value || 'silence';
        
        const params = {
            silenceThreshold: parseFloat(document.getElementById('silenceThreshold').value),
            minSegmentDuration: parseFloat(document.getElementById('minSegmentDuration').value),
            pauseTolerance: parseFloat(document.getElementById('minSilenceDuration').value) * 1000,
            numSpeakers: parseInt(document.getElementById('numSpeakers')?.value || 2),
            f0Min: parseFloat(document.getElementById('f0Min')?.value || 75),
            f0Max: parseFloat(document.getElementById('f0Max')?.value || 300),
            f0Confidence: parseFloat(document.getElementById('f0Confidence')?.value || 0.25)
        };
        
        try {
            // Save state before auto-segmentation
            this.saveState('auto-segmentation');
            
            const segments = await this.runAutoSegmentation(strategy, params);
            this.showToast(`${segments.length} segments created!`, 'success');
            this.closeAutoSegModal();
        } catch (error) {
            console.error('Segmentation error:', error);
            this.showToast('Segmentation error', 'danger');
        }
    }
    
    async runAutoSegmentation(strategy, params) {
        console.log(`🔧 Auto-segmentation: ${strategy}`, params);
        
        const progressContainer = document.getElementById('segmentationProgress');
        const progressBar = document.getElementById('segmentationProgressFill');
        const progressText = document.getElementById('segmentationProgressText');
        
        if (progressContainer) {
            progressContainer.style.display = 'block';
            progressBar.style.width = '0%';
        }
        
        try {
            let segments = [];
            
            switch (strategy) {
                case 'silence':
                    segments = await this.segmentBySilence(params, (progress) => {
                        if (progressBar) progressBar.style.width = progress + '%';
                        if (progressText) progressText.textContent = `Analyzing... ${progress}%`;
                    });
                    break;
                    
                case 'silence_f0':
                    segments = await this.segmentBySilenceAndF0(params, (progress) => {
                        if (progressBar) progressBar.style.width = progress + '%';
                        if (progressText) progressText.textContent = `F0 analysis... ${progress}%`;
                    });
                    break;
                    
                case 'vad_clustering':
                    segments = await this.segmentByVADClustering(params, (progress) => {
                        if (progressBar) progressBar.style.width = progress + '%';
                        if (progressText) progressText.textContent = `Spectral clustering... ${progress}%`;
                    });
                    break;
                    
                case 'sliding_window':
                    segments = await this.segmentBySlidingWindow(params, (progress) => {
                        if (progressBar) progressBar.style.width = progress + '%';
                        if (progressText) progressText.textContent = `Window analysis... ${progress}%`;
                    });
                    break;
            }
            
            // Créer les segments dans l'interface
            segments.forEach(seg => {
                const speakerNum = seg.speaker ? parseInt(seg.speaker.replace('spk', '')) : 1;
                this.createSegment(seg.start, seg.end, speakerNum, '');
            });
            
            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = 'Segmentation terminée!';
            
            setTimeout(() => {
                if (progressContainer) progressContainer.style.display = 'none';
            }, 1500);
            
            return segments;
            
        } catch (error) {
            console.error('Erreur segmentation:', error);
            if (progressContainer) progressContainer.style.display = 'none';
            throw error;
        }
    }
    
    async segmentBySilence(params, onProgress) {
        const channelData = this.audioBuffer.getChannelData(0);
        const sampleRate = this.audioBuffer.sampleRate;
        const threshold = params.silenceThreshold;
        const minDuration = params.minSegmentDuration;
        const pauseTolerance = params.pauseTolerance / 1000;
        
        const segments = [];
        let inSpeech = false;
        let segmentStart = 0;
        let silenceStart = 0;
        
        for (let i = 0; i < channelData.length; i++) {
            const time = i / sampleRate;
            const amplitude = Math.abs(channelData[i]);
            
            if (i % 100000 === 0) {
                const progress = Math.round((i / channelData.length) * 100);
                onProgress(progress);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            if (amplitude > threshold) {
                if (!inSpeech) {
                    segmentStart = time;
                    inSpeech = true;
                }
                silenceStart = time;
            } else {
                if (inSpeech && (time - silenceStart) > pauseTolerance) {
                    const duration = silenceStart - segmentStart;
                    if (duration >= minDuration) {
                        segments.push({
                            start: segmentStart,
                            end: silenceStart,
                            speaker: 'spk1',
                            f0: null
                        });
                    }
                    inSpeech = false;
                }
            }
        }
        
        // Dernier segment
        if (inSpeech) {
            const duration = (channelData.length / sampleRate) - segmentStart;
            if (duration >= minDuration) {
                segments.push({
                    start: segmentStart,
                    end: channelData.length / sampleRate,
                    speaker: 'spk1',
                    f0: null
                });
            }
        }
        
        console.log(`✅ ${segments.length} segments détectés par silence`);
        return segments;
    }
    
    async segmentBySilenceAndF0(params, onProgress) {
        const segments = await this.segmentBySilence(params, (p) => onProgress(p * 0.5));
        
        const numSpeakers = params.numSpeakers;
        const f0Min = params.f0Min;
        const f0Max = params.f0Max;
        
        for (let i = 0; i < segments.length; i++) {
            const progress = 50 + Math.round((i / segments.length) * 50);
            onProgress(progress);
            
            const f0 = await this.extractF0(segments[i].start, segments[i].end, f0Min, f0Max);
            segments[i].f0 = f0;
            
            if (i % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        const f0Values = segments.map(s => s.f0).filter(f0 => f0 !== null);
        if (f0Values.length > 0) {
            const clusters = this.kMeansClustering(f0Values, numSpeakers);
            
            segments.forEach(seg => {
                if (seg.f0 !== null) {
                    const clusterIndex = this.findNearestCluster(seg.f0, clusters);
                    seg.speaker = `spk${clusterIndex + 1}`;
                }
            });
        }
        
        return segments;
    }
    
    async segmentByVADClustering(params, onProgress) {
        onProgress(10);
        
        const channelData = this.audioBuffer.getChannelData(0);
        const sampleRate = this.audioBuffer.sampleRate;
        const frameSize = Math.floor(sampleRate * 0.025);
        const hopSize = Math.floor(sampleRate * 0.010);
        
        const features = [];
        
        for (let i = 0; i < channelData.length - frameSize; i += hopSize) {
            const frame = channelData.slice(i, i + frameSize);
            const energy = this.calculateEnergy(frame);
            const zcr = this.calculateZCR(frame);
            const spectralCentroid = this.calculateSpectralCentroid(frame, sampleRate);
            
            features.push({
                time: i / sampleRate,
                energy,
                zcr,
                spectralCentroid,
                isVoiced: energy > 0.01
            });
            
            if (i % 10000 === 0) {
                const progress = 10 + Math.round((i / channelData.length) * 40);
                onProgress(progress);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        onProgress(50);
        
        const segments = [];
        let currentSegment = null;
        
        features.forEach(feat => {
            if (feat.isVoiced) {
                if (!currentSegment) {
                    currentSegment = { start: feat.time, features: [] };
                }
                currentSegment.features.push(feat);
            } else {
                if (currentSegment && currentSegment.features.length > 10) {
                    const lastFeat = currentSegment.features[currentSegment.features.length - 1];
                    segments.push({
                        start: currentSegment.start,
                        end: lastFeat.time,
                        speaker: 'spk1',
                        f0: null
                    });
                }
                currentSegment = null;
            }
        });
        
        onProgress(100);
        return segments;
    }
    
    async segmentBySlidingWindow(params, onProgress) {
        return this.segmentBySilenceAndF0(params, onProgress);
    }
    
    // Fonctions utilitaires pour l'analyse audio
    
    async extractF0(startTime, endTime, f0Min, f0Max) {
        const startSample = Math.floor(startTime * this.audioBuffer.sampleRate);
        const endSample = Math.floor(endTime * this.audioBuffer.sampleRate);
        const segment = this.audioBuffer.getChannelData(0).slice(startSample, endSample);
        
        if (segment.length < 400) return null;
        
        const maxLag = Math.floor(this.audioBuffer.sampleRate / f0Min);
        const minLag = Math.floor(this.audioBuffer.sampleRate / f0Max);
        
        let maxCorr = -Infinity;
        let bestLag = 0;
        
        for (let lag = minLag; lag < Math.min(maxLag, segment.length / 2); lag++) {
            let corr = 0;
            for (let i = 0; i < segment.length - lag; i++) {
                corr += segment[i] * segment[i + lag];
            }
            if (corr > maxCorr) {
                maxCorr = corr;
                bestLag = lag;
            }
        }
        
        if (bestLag > 0) {
            return this.audioBuffer.sampleRate / bestLag;
        }
        return null;
    }
    
    kMeansClustering(values, k) {
        if (values.length < k) return values.slice(0, k);
        
        const sorted = values.slice().sort((a, b) => a - b);
        const step = Math.floor(sorted.length / k);
        const centroids = [];
        for (let i = 0; i < k; i++) {
            centroids.push(sorted[Math.min(i * step, sorted.length - 1)]);
        }
        
        for (let iter = 0; iter < 10; iter++) {
            const clusters = Array(k).fill(0).map(() => []);
            
            values.forEach(val => {
                let minDist = Infinity;
                let bestCluster = 0;
                centroids.forEach((centroid, idx) => {
                    const dist = Math.abs(val - centroid);
                    if (dist < minDist) {
                        minDist = dist;
                        bestCluster = idx;
                    }
                });
                clusters[bestCluster].push(val);
            });
            
            centroids.forEach((_, idx) => {
                if (clusters[idx].length > 0) {
                    const sum = clusters[idx].reduce((a, b) => a + b, 0);
                    centroids[idx] = sum / clusters[idx].length;
                }
            });
        }
        
        return centroids;
    }
    
    findNearestCluster(value, centroids) {
        let minDist = Infinity;
        let bestCluster = 0;
        centroids.forEach((centroid, idx) => {
            const dist = Math.abs(value - centroid);
            if (dist < minDist) {
                minDist = dist;
                bestCluster = idx;
            }
        });
        return bestCluster;
    }
    
    calculateEnergy(frame) {
        let sum = 0;
        for (let i = 0; i < frame.length; i++) {
            sum += frame[i] * frame[i];
        }
        return sum / frame.length;
    }
    
    calculateZCR(frame) {
        let count = 0;
        for (let i = 1; i < frame.length; i++) {
            if ((frame[i] >= 0 && frame[i - 1] < 0) || (frame[i] < 0 && frame[i - 1] >= 0)) {
                count++;
            }
        }
        return count / frame.length;
    }
    
    calculateSpectralCentroid(frame, sampleRate) {
        let weightedSum = 0;
        let sum = 0;
        
        for (let i = 0; i < frame.length; i++) {
            const magnitude = Math.abs(frame[i]);
            const freq = (i * sampleRate) / frame.length;
            weightedSum += freq * magnitude;
            sum += magnitude;
        }
        
        return sum > 0 ? weightedSum / sum : 0;
    }
    
    previewSegmentation() {
        const threshold = parseFloat(document.getElementById('silenceThreshold').value);
        const minDuration = parseFloat(document.getElementById('minSegmentDuration').value);
        
        const channelData = this.audioBuffer.getChannelData(0);
        const sampleRate = this.audioBuffer.sampleRate;
        
        let count = 0;
        let inSpeech = false;
        let segmentStart = 0;
        let silenceStart = 0;
        
        for (let i = 0; i < channelData.length; i++) {
            const amplitude = Math.abs(channelData[i]);
            const time = i / sampleRate;
            
            if (amplitude > threshold) {
                if (!inSpeech) {
                    segmentStart = time;
                    inSpeech = true;
                }
                silenceStart = time;
            } else {
                if (inSpeech && (time - silenceStart) > 0.3) {
                    const duration = silenceStart - segmentStart;
                    if (duration >= minDuration) {
                        count++;
                    }
                    inSpeech = false;
                }
            }
        }
        
        document.getElementById('previewResults').style.display = 'block';
        document.getElementById('previewSegmentCount').textContent = count;
    }
    
    // ========================================================================
    // EXPORT
    // ========================================================================
    
    openExportModal() {
        const total = this.segments.length;
        const transcribed = this.segments.filter(s => s.transcription).length;
        
        document.getElementById('exportSegmentCount').textContent = total;
        document.getElementById('exportTranscribedCount').textContent = transcribed;
        
        document.getElementById('exportModal').classList.add('active');
    }
    
    closeExportModal() {
        document.getElementById('exportModal').classList.remove('active');
    }
    
    doExport() {
        const format = document.getElementById('exportFormat').value;
        
        switch(format) {
            case 'eaf':
                this.exportEAF();
                break;
            case 'srt':
                this.exportSRT();
                break;
            case 'textgrid':
                this.exportTextGrid();
                break;
            case 'json':
                this.exportJSON();
                break;
            case 'csv':
                this.exportCSV();
                break;
        }
        
        this.closeExportModal();
    }
    
    exportEAF() {
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="OpenTranscriber" DATE="${new Date().toISOString()}" FORMAT="3.0" VERSION="3.0">
    <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
        <MEDIA_DESCRIPTOR MEDIA_URL="${this.audioFileName || ''}" MIME_TYPE="audio/*"/>
    </HEADER>
    <TIME_ORDER>\n`;
        
        const timeSlots = new Set();
        this.segments.forEach(s => {
            timeSlots.add(Math.floor(s.start * 1000));
            timeSlots.add(Math.floor(s.end * 1000));
        });
        
        const sortedSlots = Array.from(timeSlots).sort((a, b) => a - b);
        const slotMap = {};
        
        sortedSlots.forEach((time, idx) => {
            const slotId = `ts${idx + 1}`;
            xml += `        <TIME_SLOT TIME_SLOT_ID="${slotId}" TIME_VALUE="${time}"/>\n`;
            slotMap[time] = slotId;
        });
        
        xml += `    </TIME_ORDER>\n`;
        
        this.speakerTracks.forEach(track => {
            xml += `    <TIER LINGUISTIC_TYPE_REF="default-lt" TIER_ID="${track.name}">\n`;
            
            const segs = this.segments
                .filter(s => s.speaker === track.speakerNum)
                .sort((a, b) => a.start - b.start);
            
            segs.forEach(s => {
                const startSlot = slotMap[Math.floor(s.start * 1000)];
                const endSlot = slotMap[Math.floor(s.end * 1000)];
                
                xml += `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a${s.id}" TIME_SLOT_REF1="${startSlot}" TIME_SLOT_REF2="${endSlot}">
                <ANNOTATION_VALUE>${this.escapeXml(s.transcription || '')}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>\n`;
            });
            
            xml += `    </TIER>\n`;
        });
        
        xml += `    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true"/>
</ANNOTATION_DOCUMENT>`;
        
        this.downloadFile('transcription.eaf', xml, 'text/xml');
    }
    
    exportSRT() {
        let srt = '';
        const sortedSegs = [...this.segments].sort((a, b) => a.start - b.start);
        
        sortedSegs.forEach((seg, idx) => {
            srt += `${idx + 1}\n`;
            srt += `${this.formatSRTTime(seg.start)} --> ${this.formatSRTTime(seg.end)}\n`;
            srt += `${seg.transcription || ''}\n\n`;
        });
        
        this.downloadFile('transcription.srt', srt, 'text/plain');
    }
    
    exportTextGrid() {
        const duration = this.masterWave.getDuration();
        
        let tg = `File type = "ooTextFile"\nObject class = "TextGrid"\n\nxmin = 0\nxmax = ${duration}\ntiers? <exists>\nsize = ${this.speakerTracks.length}\nitem []:\n`;
        
        this.speakerTracks.forEach((track, idx) => {
            const segs = this.segments
                .filter(s => s.speaker === track.speakerNum)
                .sort((a, b) => a.start - b.start);
            
            tg += `    item [${idx + 1}]:\n`;
            tg += `        class = "IntervalTier"\n`;
            tg += `        name = "${track.name}"\n`;
            tg += `        xmin = 0\n`;
            tg += `        xmax = ${duration}\n`;
            tg += `        intervals: size = ${segs.length}\n`;
            
            segs.forEach((seg, i) => {
                tg += `        intervals [${i + 1}]:\n`;
                tg += `            xmin = ${seg.start}\n`;
                tg += `            xmax = ${seg.end}\n`;
                tg += `            text = "${seg.transcription || ''}"\n`;
            });
        });
        
        this.downloadFile('transcription.TextGrid', tg, 'text/plain');
    }
    
    exportJSON() {
        const data = {
            audio: this.audioFileName || '',
            duration: this.masterWave?.getDuration() || 0,
            speakers: this.speakerTracks.map(t => ({
                id: t.speakerNum,
                name: t.name
            })),
            segments: this.segments.map(s => ({
                id: s.id,
                start: s.start,
                end: s.end,
                speaker: s.speaker,
                transcription: s.transcription
            }))
        };
        
        this.downloadFile('transcription.json', JSON.stringify(data, null, 2), 'application/json');
    }
    
    exportCSV() {
        let csv = 'ID,Start,End,Duration,Speaker,Transcription\n';
        
        this.segments
            .sort((a, b) => a.start - b.start)
            .forEach(s => {
                csv += `${s.id},${s.start.toFixed(3)},${s.end.toFixed(3)},${(s.end - s.start).toFixed(3)},${s.speaker},"${(s.transcription || '').replace(/"/g, '""')}"\n`;
            });
        
        this.downloadFile('transcription.csv', csv, 'text/csv');
    }
    
    // ========================================================================
    // EVENT LISTENERS
    // ========================================================================
    
    initEventListeners() {
        // Audio loading
        document.getElementById('audioFileInput').addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.clearHistory();
                this.loadAudioFile(e.target.files[0]);
            }
        });
        
        // Import
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFileInput').click();
        });
        
        document.getElementById('importFileInput').addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.importProject(e.target.files[0]);
            }
        });
        
        // Save
        document.getElementById('saveBtn').addEventListener('click', () => {
            this.saveProject();
        });
        
        // Undo/Redo buttons
        document.getElementById('undoBtn').addEventListener('click', () => {
            this.undo();
        });
        
        document.getElementById('redoBtn').addEventListener('click', () => {
            this.redo();
        });
        
        // Playback controls
        document.getElementById('playBtn').addEventListener('click', () => {
            this.masterWave.playPause();
        });
        
        document.getElementById('stopBtn').addEventListener('click', () => {
            this.masterWave.stop();
            this.isPlayingSegment = false;
        });
        
        document.getElementById('playbackRate').addEventListener('change', (e) => {
            this.masterWave.setPlaybackRate(parseFloat(e.target.value), true);
        });
        
        document.getElementById('volumeSlider').addEventListener('input', (e) => {
            const vol = e.target.value / 100;
            this.masterWave.setVolume(vol);
            document.getElementById('volumeValue').textContent = `${e.target.value}%`;
        });
        
        document.getElementById('zoomSlider').addEventListener('input', (e) => {
            const zoom = parseInt(e.target.value);
            this.masterWave.zoom(zoom);
            document.getElementById('zoomValue').textContent = zoom;
        });
        
        // Audio filters
        document.getElementById('highpassSlider').addEventListener('input', (e) => {
            const freq = parseInt(e.target.value);
            this.setHighpassFrequency(freq);
            document.getElementById('highpassValue').textContent = `${freq} Hz`;
        });
        
        document.getElementById('lowpassSlider').addEventListener('input', (e) => {
            const freq = parseInt(e.target.value);
            this.setLowpassFrequency(freq);
            document.getElementById('lowpassValue').textContent = freq >= 10000 ? `${Math.round(freq/1000)}k Hz` : `${freq} Hz`;
        });
        
        document.getElementById('resetFiltersBtn').addEventListener('click', () => {
            this.resetFilters();
        });
        
        // Filtre d'affichage par locuteur
        document.querySelector('input[name="speakerFilter"][value="all"]').addEventListener('change', () => {
            this.filterSegmentsBySpeaker('all');
        });
        
        // Locuteurs
        document.getElementById('addSpeakerBtn').addEventListener('click', () => {
            this.addSpeaker();
        });
        
        // Édition
        document.getElementById('speakerSelect').addEventListener('change', () => {
            if (this.selectedSegment) {
                const newSpeaker = parseInt(document.getElementById('speakerSelect').value);
                if (newSpeaker !== this.selectedSegment.speaker) {
                    const oldTrack = this.speakerTracks.find(t => t.speakerNum === this.selectedSegment.speaker);
                    if (oldTrack) oldTrack.removeSegment(this.selectedSegment.id);
                    
                    this.selectedSegment.speaker = newSpeaker;
                    this.selectedSegment.color = this.speakerColors[(newSpeaker - 1) % this.speakerColors.length];
                    
                    const newTrack = this.speakerTracks.find(t => t.speakerNum === newSpeaker);
                    if (newTrack) newTrack.addSegment(this.selectedSegment);
                    
                    const regions = this.masterRegions.getRegions();
                    const masterRegion = regions.find(r => r.id === this.selectedSegment.id);
                    if (masterRegion) {
                        masterRegion.setOptions({ color: this.selectedSegment.color.bg });
                    }
                }
            }
        });
        
        document.getElementById('transcriptionInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.saveTranscription();
                this.goToNextSegment();
            }
        });
        
        // Lecture du segment
        document.getElementById('playSegmentBtn').addEventListener('click', () => {
            this.playSelectedSegment();
        });
        
        // Toggle boucle
        document.getElementById('loopToggle').addEventListener('change', (e) => {
            this.loopEnabled = e.target.checked;
        });
        
        document.getElementById('deleteSegmentBtn').addEventListener('click', () => {
            this.deleteSegment();
        });
        
        document.getElementById('nextSegmentBtn').addEventListener('click', () => {
            this.goToNextSegment();
        });
        
        document.getElementById('closeEditionBtn').addEventListener('click', () => {
            this.closeEditor();
        });
        
        // Auto-segmentation
        document.getElementById('autoSegBtn').addEventListener('click', () => {
            this.openAutoSegModal();
        });
        
        const strategySelect = document.getElementById('segmentationStrategy');
        if (strategySelect) {
            strategySelect.addEventListener('change', (e) => {
                const advancedParams = document.getElementById('advancedParams');
                if (e.target.value === 'silence_f0' || e.target.value === 'vad_clustering') {
                    advancedParams.style.display = 'block';
                } else {
                    advancedParams.style.display = 'none';
                }
                
                const descriptions = {
                    'silence': 'Détection des silences : segmente selon les pauses (rapide, fiable)',
                    'silence_f0': 'Silences + F0 : attribue automatiquement les locuteurs selon la hauteur de voix',
                    'vad_clustering': 'VAD + Clustering : analyse spectrale avancée pour détecter les changements de locuteur',
                    'sliding_window': 'Fenêtre glissante : détection ML des changements (expérimental)'
                };
                const small = e.target.parentElement.querySelector('small');
                if (small) {
                    small.textContent = descriptions[e.target.value];
                }
            });
        }
        
        ['silenceThreshold', 'minSilenceDuration', 'minSegmentDuration', 'f0Min', 'f0Max', 'f0Confidence'].forEach(id => {
            const slider = document.getElementById(id);
            if (slider) {
                slider.addEventListener('input', (e) => {
                    const valueSpan = document.getElementById(id + 'Value');
                    if (valueSpan) {
                        valueSpan.textContent = e.target.value;
                    }
                });
            }
        });
        
        document.getElementById('previewSegBtn').addEventListener('click', () => {
            this.previewSegmentation();
        });
        
        document.getElementById('applySegBtn').addEventListener('click', () => {
            this.autoSegment();
        });
        
        document.getElementById('cancelSegBtn').addEventListener('click', () => {
            this.closeAutoSegModal();
        });
        
        // Export
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.openExportModal();
        });
        
        document.getElementById('confirmExportBtn').addEventListener('click', () => {
            this.doExport();
        });
        
        document.getElementById('cancelExportBtn').addEventListener('click', () => {
            this.closeExportModal();
        });
        
        // Aide
        document.getElementById('helpBtn').addEventListener('click', () => {
            document.getElementById('helpOverlay').style.display = 'flex';
        });
        
        document.querySelector('.btn-close-help').addEventListener('click', () => {
            document.getElementById('helpOverlay').style.display = 'none';
        });
        
        // Fermer modales avec close-btn
        document.querySelectorAll('.modal .close-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').classList.remove('active');
            });
        });
    }
    
    // ========================================================================
    // KEYBOARD SHORTCUTS
    // ========================================================================
    
    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Handle Ctrl+Z (Undo) and Ctrl+Y (Redo) globally
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                this.undo();
                return;
            }
            
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                this.redo();
                return;
            }
            
            // Ignore other shortcuts when typing in input/textarea
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                if (e.key === 'Escape') {
                    e.target.blur();
                    this.closeEditor();
                }
                // Allow Ctrl+Space for play/pause in transcription input
                if (e.key === ' ' && e.ctrlKey) {
                    e.preventDefault();
                    this.playSelectedSegment();
                }
                return;
            }
            
            // Prevent default Tab behavior
            if (e.key === 'Tab') {
                e.preventDefault();
            }
            
            switch(e.key) {
                case ' ':
                    e.preventDefault();
                    if (this.selectedSegment && this.isPlayingSegment) {
                        // Toggle pause/play for segment
                        if (this.masterWave.isPlaying()) {
                            this.masterWave.pause();
                        } else {
                            this.playSelectedSegment();
                        }
                    } else {
                        this.masterWave.playPause();
                    }
                    break;
                    
                case 's':
                case 'S':
                    e.preventDefault();
                    this.toggleMarking();
                    break;
                    
                case 'l':
                case 'L':
                    e.preventDefault();
                    this.toggleLoop();
                    break;
                    
                case 'ArrowLeft':
                    e.preventDefault();
                    this.masterWave.skip(-5);
                    break;
                    
                case 'ArrowRight':
                    e.preventDefault();
                    this.masterWave.skip(5);
                    break;
                    
                case 'Home':
                    e.preventDefault();
                    this.masterWave.setTime(0);
                    break;
                    
                case 'End':
                    e.preventDefault();
                    this.masterWave.setTime(this.masterWave.getDuration());
                    break;
                    
                case 'PageUp':
                    e.preventDefault();
                    this.moveSegmentToSpeaker(-1);
                    break;
                    
                case 'PageDown':
                    e.preventDefault();
                    this.moveSegmentToSpeaker(1);
                    break;
                    
                case 'Delete':
                    e.preventDefault();
                    this.deleteSegment();
                    break;
                    
                case 'n':
                case 'N':
                    e.preventDefault();
                    this.goToNextSegment();
                    break;
                    
                case 'p':
                case 'P':
                    e.preventDefault();
                    this.goToPreviousSegment();
                    break;
                    
                case 'Escape':
                    e.preventDefault();
                    this.closeEditor();
                    this.isPlayingSegment = false;
                    break;
                    
                case '?':
                    e.preventDefault();
                    document.getElementById('helpOverlay').style.display = 'flex';
                    break;
            }
        });
    }
    
    goToNextSegment() {
        if (!this.selectedSegment) return;
        
        const sorted = [...this.segments].sort((a, b) => a.start - b.start);
        const currentIndex = sorted.findIndex(s => s.id === this.selectedSegment.id);
        
        if (currentIndex < sorted.length - 1) {
            this.selectSegment(sorted[currentIndex + 1]);
        }
    }
    
    goToPreviousSegment() {
        if (!this.selectedSegment) return;
        
        const sorted = [...this.segments].sort((a, b) => a.start - b.start);
        const currentIndex = sorted.findIndex(s => s.id === this.selectedSegment.id);
        
        if (currentIndex > 0) {
            this.selectSegment(sorted[currentIndex - 1]);
        }
    }
    
    // ========================================================================
    // UTILITAIRES
    // ========================================================================
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
    }
    
    formatSRTTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    }
    
    escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    
    downloadFile(filename, content, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast toast-${type} toast-show`;
        
        setTimeout(() => {
            toast.classList.remove('toast-show');
        }, 3000);
    }
}

// ============================================================================
// CLASSE PISTE LOCUTEUR
// ============================================================================

class SpeakerTrack {
    constructor(speakerNum, color, app) {
        this.speakerNum = speakerNum;
        this.color = color;
        this.name = `Speaker ${speakerNum}`;
        this.app = app;
        this.wave = null;
        this.regions = null;
        this.container = null;
        
        this.createUI();
    }
    
    createUI() {
        const container = document.createElement('section');
        container.className = 'speaker-track';
        container.setAttribute('data-speaker', this.speakerNum);
        container.style.borderLeft = `5px solid ${this.color.border}`;
        
        container.innerHTML = `
            <div class="track-header">
                <input type="text" class="speaker-name" value="${this.name}">
                <button class="btn-remove" title="Remove">🗑</button>
            </div>
            <div class="waveform-container"></div>
        `;
        
        document.getElementById('speakersContainer').appendChild(container);
        this.container = container;
        
        // Events
        container.querySelector('.speaker-name').addEventListener('change', (e) => {
            this.name = e.target.value;
            this.app.updateSpeakerSelect();
            this.app.updateSpeakerFilterButtons();
        });
        
        container.querySelector('.btn-remove').addEventListener('click', () => {
            if (confirm(`Remove ${this.name}?`)) {
                this.app.removeSpeaker(this.speakerNum);
            }
        });
    }
    
    async loadAudio(file) {
        this.wave = WaveSurfer.create({
            container: this.container.querySelector('.waveform-container'),
            waveColor: '#ddd',
            progressColor: this.color.border,
            cursorColor: this.color.border,
            barWidth: 2,
            height: 60,
            normalize: true,
            minPxPerSec: 50
        });
        
        this.regions = this.wave.registerPlugin(WaveSurfer.Regions.create());
        
        await this.wave.loadBlob(file);
        
        // Events
        this.regions.on('region-clicked', (r, e) => {
            e.stopPropagation();
            const segment = this.app.segments.find(s => s.id === r.id);
            if (segment) {
                this.app.selectSegment(segment);
            }
        });
        
        this.regions.on('region-double-clicked', (r) => {
            this.app.openInlineEditor(r);
        });
    }
    
    addSegment(segment) {
        if (!this.regions) return;
        
        this.regions.addRegion({
            id: segment.id,
            start: segment.start,
            end: segment.end,
            color: this.color.bg,
            drag: true,
            resize: true,
            content: segment.transcription || ''
        });
    }
    
    removeSegment(segmentId) {
        if (!this.regions) return;
        
        const regions = this.regions.getRegions();
        const region = regions.find(r => r.id === segmentId);
        if (region) {
            region.remove();
        }
    }
    
    updateSegmentPosition(segment) {
        if (!this.regions) return;
        
        const regions = this.regions.getRegions();
        const region = regions.find(r => r.id === segment.id);
        if (region) {
            region.setOptions({
                start: segment.start,
                end: segment.end
            });
        }
    }
    
    updateSegmentVisual(segment) {
        if (!this.regions) return;
        
        const regions = this.regions.getRegions();
        const region = regions.find(r => r.id === segment.id);
        if (region) {
            region.setOptions({
                content: segment.transcription || ''
            });
        }
    }
    
    clearSegments() {
        if (this.regions) {
            this.regions.clearRegions();
        }
    }
    
    updateNumber(newNum) {
        this.speakerNum = newNum;
        this.name = `Speaker ${newNum}`;
        this.container.setAttribute('data-speaker', newNum);
        this.container.querySelector('.speaker-name').value = this.name;
    }
    
    destroy() {
        if (this.wave) {
            this.wave.destroy();
        }
        if (this.container) {
            this.container.remove();
        }
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (typeof WaveSurfer === 'undefined') {
        alert('Error: WaveSurfer not loaded. Check your internet connection.');
        return;
    }
    
    console.log('✅ WaveSurfer detected');
    window.app = new OpenTranscriber();
});
