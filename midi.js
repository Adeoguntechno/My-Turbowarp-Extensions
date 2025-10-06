/**
 * MIDI extension for TurboWarp / Scratch VM
 *
 * Save as midi-extension.js and load it in TurboWarp.
 *
 * Author: ChatGPT (example)
 * License: MIT
 *
 * Features:
 *  - connect to Web MIDI
 *  - list outputs (JSON)
 *  - select an output (by id)
 *  - send note on / note off / cc / program change
 *  - send raw bytes (for SysEx etc)
 *
 * Usage:
 *  - Run "connect to MIDI" (will prompt for permission)
 *  - Use "list MIDI outputs" to get JSON with available outputs
 *  - Use "select MIDI output [id]" to cache an output for later sends
 *  - Or pass the output id directly into send blocks' last parameter
 *
 * Note: dynamic dropdowns are not used (to keep extension simple).
 */

class MidiExtension {
    constructor(runtime) {
        this.runtime = runtime;

        // Browser Web MIDI objects/state
        this._midiAccess = null; // MIDIAccess
        this._outputs = new Map(); // id -> MIDIOutput
        this._selectedOutputId = null;
    }

    /**
     * Helper: request MIDI access (sysex true)
     */
    async _requestMIDIAccess() {
        if (this._midiAccess) return this._midiAccess;
        if (!navigator || !navigator.requestMIDIAccess) {
            throw new Error('Web MIDI API not supported in this browser.');
        }
        // Request sysex to allow raw bytes if user needs them.
        this._midiAccess = await navigator.requestMIDIAccess({ sysex: true });
        // refresh onstatechange
        this._midiAccess.onstatechange = () => {
            this._refreshOutputs();
        };
        await this._refreshOutputs();
        return this._midiAccess;
    }

    /**
     * Helper: refresh available outputs
     */
    async _refreshOutputs() {
        this._outputs.clear();
        if (!this._midiAccess) return;
        for (const output of this._midiAccess.outputs.values()) {
            this._outputs.set(output.id, output);
        }
    }

    /**
     * Helper: get an output by id or return the selected output
     */
    _getOutputByIdOrSelected(id) {
        if (id && String(id).trim() !== '') {
            return this._outputs.get(String(id)) || null;
        }
        if (this._selectedOutputId) {
            return this._outputs.get(this._selectedOutputId) || null;
        }
        return null;
    }

    /**
     * Convert channel number 1-16 to midi channel 0-15
     */
    _chanToZeroBased(ch) {
        const c = Number(ch);
        if (Number.isNaN(c)) return 0;
        return Math.max(0, Math.min(15, Math.floor(c) - 1));
    }

    /**
     * Build MIDI status byte for channel voice message
     * type: 'noteon', 'noteoff', 'cc', 'program'
     */
    _statusByte(type, channelZeroBased) {
        const ch = channelZeroBased & 0x0f;
        switch (type) {
            case 'noteon': return 0x90 | ch;
            case 'noteoff': return 0x80 | ch;
            case 'cc': return 0xB0 | ch;
            case 'program': return 0xC0 | ch;
            default: return 0x00;
        }
    }

    /******************************
     *  Extension blocks (API)
     ******************************/
    getInfo() {
        return {
            id: 'midiExtension',
            name: 'MIDI',
            color1: '#3C9C9C',
            color2: '#2C7C7C',
            blocks: [
                {
                    opcode: 'connectToMidi',
                    blockType: 'command',
                    text: 'connect to MIDI (request permission)'
                },
                {
                    opcode: 'listOutputs',
                    blockType: 'reporter',
                    text: 'list MIDI outputs (JSON)'
                },
                {
                    opcode: 'selectOutput',
                    blockType: 'command',
                    text: 'select MIDI output [ID]',
                    arguments: {
                        ID: {
                            type: 'string',
                            defaultValue: ''
                        }
                    }
                },
                {
                    opcode: 'selectedOutput',
                    blockType: 'reporter',
                    text: 'selected MIDI output id'
                },
                {
                    opcode: 'sendNoteOn',
                    blockType: 'command',
                    text: 'send note on note [NOTE] velocity [VEL] channel [CH] to [ID]',
                    arguments: {
                        NOTE: { type: 'number', defaultValue: 60 },
                        VEL: { type: 'number', defaultValue: 100 },
                        CH: { type: 'number', defaultValue: 1 },
                        ID: { type: 'string', defaultValue: '' }
                    }
                },
                {
                    opcode: 'sendNoteOff',
                    blockType: 'command',
                    text: 'send note off note [NOTE] velocity [VEL] channel [CH] to [ID]',
                    arguments: {
                        NOTE: { type: 'number', defaultValue: 60 },
                        VEL: { type: 'number', defaultValue: 64 },
                        CH: { type: 'number', defaultValue: 1 },
                        ID: { type: 'string', defaultValue: '' }
                    }
                },
                {
                    opcode: 'sendCC',
                    blockType: 'command',
                    text: 'send control change controller [CC] value [VAL] channel [CH] to [ID]',
                    arguments: {
                        CC: { type: 'number', defaultValue: 1 },
                        VAL: { type: 'number', defaultValue: 127 },
                        CH: { type: 'number', defaultValue: 1 },
                        ID: { type: 'string', defaultValue: '' }
                    }
                },
                {
                    opcode: 'sendProgramChange',
                    blockType: 'command',
                    text: 'send program change program [PROG] channel [CH] to [ID]',
                    arguments: {
                        PROG: { type: 'number', defaultValue: 0 },
                        CH: { type: 'number', defaultValue: 1 },
                        ID: { type: 'string', defaultValue: '' }
                    }
                },
                {
                    opcode: 'sendRawBytes',
                    blockType: 'command',
                    text: 'send raw midi bytes [BYTES] to [ID]',
                    arguments: {
                        BYTES: { type: 'string', defaultValue: '0xF0,0x7E,0x7F,0x09,0x01,0xF7' },
                        ID: { type: 'string', defaultValue: '' }
                    }
                },
                {
                    opcode: 'outputCount',
                    blockType: 'reporter',
                    text: 'MIDI output count'
                }
            ],
            menus: {
                // no dynamic dropdowns here; outputs are read via listOutputs()
            }
        };
    }

    /**
     * Connect to MIDI (asks permission). Returns immediately (command block).
     */
    async connectToMidi() {
        try {
            await this._requestMIDIAccess();
            // refreshOutputs already runs in request
            console.log('MIDI access granted. Outputs:', Array.from(this._outputs.keys()));
        } catch (err) {
            console.error('MIDI connection failed:', err);
            // notify runtime console; in Scratch/TurboWarp you might want to surface errors differently
        }
    }

    /**
     * Return JSON string array of outputs: [{id, name, manufacturer, state, connection}, ...]
     */
    listOutputs() {
        // if not initialized, return empty JSON
        if (!this._midiAccess) {
            return JSON.stringify([]);
        }
        const arr = [];
        for (const out of this._midiAccess.outputs.values()) {
            arr.push({
                id: out.id,
                name: out.name,
                manufacturer: out.manufacturer,
                state: out.state,
                connection: out.connection
            });
        }
        return JSON.stringify(arr);
    }

    /**
     * Select MIDI output by id (string). Passing empty clears selection.
     */
    selectOutput(args) {
        const id = String(args.ID || '').trim();
        if (id === '') {
            this._selectedOutputId = null;
            return;
        }
        if (!this._midiAccess) {
            console.warn('No MIDI access yet. Call "connect to MIDI" first.');
            this._selectedOutputId = null;
            return;
        }
        const out = this._outputs.get(id);
        if (!out) {
            console.warn(`No MIDI output found with id: ${id}`);
            this._selectedOutputId = null;
            return;
        }
        this._selectedOutputId = id;
    }

    selectedOutput() {
        return this._selectedOutputId || '';
    }

    outputCount() {
        if (!this._midiAccess) return 0;
        return this._midiAccess.outputs.size;
    }

    /**
     * Send Note On
     */
    sendNoteOn(args) {
        const note = Number(args.NOTE) || 0;
        const vel = Number(args.VEL) || 0;
        const ch = this._chanToZeroBased(args.CH);
        const id = String(args.ID || '').trim();
        const out = this._getOutputByIdOrSelected(id);
        if (!out) {
            console.warn('No MIDI output selected or invalid id; cannot send note on.');
            return;
        }
        const status = this._statusByte('noteon', ch);
        const msg = [status, note & 0x7f, vel & 0x7f];
        try {
            out.send(msg);
        } catch (e) {
            console.error('Failed sending Note On:', e);
        }
    }

    /**
     * Send Note Off
     */
    sendNoteOff(args) {
        const note = Number(args.NOTE) || 0;
        const vel = Number(args.VEL) || 0;
        const ch = this._chanToZeroBased(args.CH);
        const id = String(args.ID || '').trim();
        const out = this._getOutputByIdOrSelected(id);
        if (!out) {
            console.warn('No MIDI output selected or invalid id; cannot send note off.');
            return;
        }
        const status = this._statusByte('noteoff', ch);
        const msg = [status, note & 0x7f, vel & 0x7f];
        try {
            out.send(msg);
        } catch (e) {
            console.error('Failed sending Note Off:', e);
        }
    }

    /**
     * Send Control Change
     */
    sendCC(args) {
        const cc = Number(args.CC) || 0;
        const val = Number(args.VAL) || 0;
        const ch = this._chanToZeroBased(args.CH);
        const id = String(args.ID || '').trim();
        const out = this._getOutputByIdOrSelected(id);
        if (!out) {
            console.warn('No MIDI output selected or invalid id; cannot send CC.');
            return;
        }
        const status = this._statusByte('cc', ch);
        const msg = [status, cc & 0x7f, val & 0x7f];
        try {
            out.send(msg);
        } catch (e) {
            console.error('Failed sending CC:', e);
        }
    }

    /**
     * Send Program Change
     */
    sendProgramChange(args) {
        const prog = Number(args.PROG) || 0;
        const ch = this._chanToZeroBased(args.CH);
        const id = String(args.ID || '').trim();
        const out = this._getOutputByIdOrSelected(id);
        if (!out) {
            console.warn('No MIDI output selected or invalid id; cannot send Program Change.');
            return;
        }
        const status = this._statusByte('program', ch);
        const msg = [status, prog & 0x7f];
        try {
            out.send(msg);
        } catch (e) {
            console.error('Failed sending Program Change:', e);
        }
    }

    /**
     * Send raw bytes, encoded as a comma-separated list of hex or decimal values.
     * e.g. "0xF0,0x7E,0x7F,0x09,0x01,0xF7" or "240,126,127,9,1,247"
     */
    sendRawBytes(args) {
        const bytesStr = String(args.BYTES || '');
        const id = String(args.ID || '').trim();
        const out = this._getOutputByIdOrSelected(id);
        if (!out) {
            console.warn('No MIDI output selected or invalid id; cannot send raw bytes.');
            return;
        }
        const parts = bytesStr.split(',').map(s => s.trim()).filter(Boolean);
        const bytes = [];
        for (const p of parts) {
            if (p.startsWith('0x') || p.startsWith('0X')) {
                bytes.push(parseInt(p, 16) & 0xff);
            } else {
                bytes.push(parseInt(p, 10) & 0xff);
            }
        }
        try {
            out.send(bytes);
        } catch (e) {
            console.error('Failed sending raw bytes:', e);
        }
    }
}

// Export in a way TurboWarp/Scratch VM expects
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MidiExtension;
} else {
    // If loaded in a page that expects a factory (older style), attach to window
    window.MidiExtension = MidiExtension;
}
