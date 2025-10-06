/* TurboWarp MIDI extension
   - Provides basic Web MIDI output functionality.
   - Requires "Run extension without sandbox" to access navigator.requestMIDIAccess (or use HTTPS/unsandboxed).

   Blocks provided:
   - request midi access -> reports "granted" or "denied"
   - midi outputs -> reports comma-separated output names
   - select midi output [NAME] -> selects an output by name (or index)
   - send note on [NOTE] velocity [VEL] channel [CH]
   - send note off [NOTE] velocity [VEL] channel [CH]
   - send raw bytes [BYTES]

   Usage:
   - Add Custom Extension in TurboWarp and paste this file's contents.
   - Allow unsandboxed execution if prompted.
*/

class TurboMidi {
  constructor (runtime) {
    this.runtime = runtime;
    this.midiAccess = null;
    this.selectedOutputId = null; // id of selected output
  }

  getInfo () {
    return {
      id: 'turbo_midi',
      name: 'MIDI Out',
      blocks: [
        {
          opcode: 'requestAccess',
          blockType: Scratch.BlockType.REPORTER,
          text: 'request midi access'
        },
        {
          opcode: 'listOutputs',
          blockType: Scratch.BlockType.REPORTER,
          text: 'midi outputs'
        },
        {
          opcode: 'selectOutput',
          blockType: Scratch.BlockType.COMMAND,
          text: 'select output [OUTPUT]'
        },
        {
          opcode: 'sendNoteOn',
          blockType: Scratch.BlockType.COMMAND,
          text: 'send note on [NOTE] velocity [VELOCITY] channel [CHANNEL]',
          arguments: {
            NOTE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 60 },
            VELOCITY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 127 },
            CHANNEL: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }
          }
        },
        {
          opcode: 'sendNoteOff',
          blockType: Scratch.BlockType.COMMAND,
          text: 'send note off [NOTE] velocity [VELOCITY] channel [CHANNEL]',
          arguments: {
            NOTE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 60 },
            VELOCITY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 64 },
            CHANNEL: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }
          }
        },
        {
          opcode: 'sendRaw',
          blockType: Scratch.BlockType.COMMAND,
          text: 'send raw bytes [BYTES]',
          arguments: {
            BYTES: { type: Scratch.ArgumentType.STRING, defaultValue: '0x90,60,127' }
