"use strict"

//
// Messages - could be localized, if you want!
//

const ERROR_NO_MIDI_DEVICES = "No MIDI input devices detected.";
const ERROR_UNHANDLED_EVENT = "Unhandled event";

//
// Constant settings - maybe configurable in the future?
//

const MAX_VELOCITY = 127.00;
const LOW_KEY = 21;
const MAX_KEYS = 88;

const CANVAS_WIDTH  = 60 * 8;
const CANVAS_HEIGHT = MAX_KEYS * 8;

//
// Draw methods for notches, in order of interpolation between low
// color and high color (0.00 .. 1.00)
//

const DRAW_COLOR1      = 'color1'
const DRAW_COLOR1_LINE = 'color1-line'
const DRAW_STRIPES     = 'stripes'
const DRAW_COLOR2_LINE = 'color2-line'

//
// References to elements
//

const gBody   = document.body;
const gInput  = document.getElementById('input');
const gCanvas = document.getElementById('display');
const gContext = gCanvas.getContext('2d');
const gFullscreenButton = document.getElementById('fullscreen-button');

//
// Internal structures
//

// All the keys tracked, with this object:
//  {
//      volume = [0.00 .. 1.00]
//  }

const gKeys = Array(MAX_KEYS).fill(null);

// All the "notches", which indicate specific colors at specific volumes.
// *Must* be defined with "volume" in low-to-high order.
//
// Object format:
//  {
//      volume = [0.00 .. 1.00]
//      color: string for 'gContext.fillStyle'
//  }

const gNotches = [
    { volume: 0.00, color: '#000' }, // 0: Black
    { volume: 0.10, color: '#f00' }, // 1: Red
    { volume: 0.20, color: '#f80' }, // 2: Orange
    { volume: 0.30, color: '#ff0' }, // 3: Yellow
    { volume: 0.40, color: '#0f0' }, // 4: Green
    { volume: 0.50, color: '#0ff' }, // 5: Cyan
    { volume: 0.60, color: '#08f' }, // 6: Cobalt
    { volume: 0.70, color: '#00f' }, // 7: Blue
    { volume: 0.80, color: '#c0f' }, // 8: Purple
    { volume: 0.90, color: '#f48' }, // 9: Fuscia
    { volume: 1.00, color: '#fff' }, // 10: White
];

//
// More constants - set using existing data.
//

const MAX_NOTCHES = gNotches.length;

//
// Mutable global variables
//

let gInputs  = null;
let gPos     = 0;
let gFrame   = 0;
let gRunning = false;
let gPixelsPerNote  = undefined;
let gMiddleHeight   = undefined;
let gMiddleOffset   = undefined;
let gOrigBodyClass  = gBody.className;
let gOrigInputClass = gInput.className;
let gFullscreenOn   = false;

// Initializes application. Always run first.
function init() {
    // Set the internal drawing size of our canvas.
    gCanvas.width  = CANVAS_WIDTH;
    gCanvas.height = CANVAS_HEIGHT;

    gFullscreenButton.onclick = toggleFullscreen;

    // Pre-calculations.
    gPixelsPerNote = gCanvas.height / MAX_KEYS;
    gMiddleHeight  = gPixelsPerNote * 0.25;
    gMiddleOffset  = (gPixelsPerNote - gMiddleHeight) / 2;

    // Activate MIDI.
    navigator
        .requestMIDIAccess()
        .then(initMidi);
}

// Error message in a box.
function errorAlert(message) {
    alert(message);
}

// Error message in the console.
function errorConsole(message) {
    console.error(message);
}

// Initializes MIDI features. Executed as a callback in requestMIDIAccess().
function initMidi(access) {
    gInputs = access.inputs;

    // Register all MIDI input devices.
    // TODO: all input from all devices is routed to the same gKeys[] values.
    // TODO: in other words, it breaks if you play two keyboards at once! :D
    // TODO: fix that by tracking key states per input!
    let count = 0;
    for (let input of gInputs.values()) {
        registerInput(input);
        count++;
    }

    // Bail if there's no MIDI input device.
    // TODO: allow (un)plugging of devices at runtime.
    // TODO: allow selecting input devices.
    if (count == 0) {
        errorAlert(ERROR_NO_MIDI_DEVICES);
        return;
    }

    // Start application!
    startRunning();
}

// Interprets a single MIDI event from a device and acts accordingly.
// TODO: should specify device if it doesn't already.
function handleMidiMessage(message) {
    var data = message.data;

    // data[0] is the MIDI command.
    switch (data[0]) {
        // Note on/off. Here's the good stuff.
        case 144: {
            let key = data[1];
            let velocity = data[2];

            // Handle note off/on in separate functions.
            if (velocity == 0)
                eventNoteOff(key);
            else
                eventNoteOn(key, velocity);

            break;
        }

        // Keep-alive message; we don't care about this here.
        case 254:
            break;

        // Command not handled - complain in the console!
        default:
            errorConsole(ERROR_UNHANDLED_EVENT + ": " + data);
            break;
    }
}

// Individual setup per MIDI input device.
// TODO: track devices internally.
function registerInput(input) {
    input.onmidimessage = handleMidiMessage;
}

// Converts the key from a MIDI event to the key number used in JSKBD.
function midiKeyToArrayKey(midiKey) {
    if (midiKey < LOW_KEY || midiKey >= (LOW_KEY + MAX_KEYS))
        return null;
    return midiKey - LOW_KEY;
}

// Converts the velocity from a MIDI event to the internally-stored volume.
function velocityToVolume(velocity) {
    return velocity / MAX_VELOCITY;
}

// Event triggered when a note stops.
// TODO: probably needs the device
function eventNoteOff(midiKey) {
    let key = midiKeyToArrayKey(midiKey);
    if (key == null)
        return;
    gKeys[key] = null;
}

// Event triggered when a note begins.
// TODO: probably needs the device
function eventNoteOn(midiKey, velocity) {
    let key = midiKeyToArrayKey(midiKey);
    if (key == null)
        return;
    gKeys[key] = {
        volume: velocityToVolume(velocity),
    };
}

// Draw a single animation frame.
function animFrame() {
    clearLine();
    drawMidiLine();
    updatePosition();
    drawPositionLine();
}

// Clear the current cursor position before drawing the sequencer display.
function clearLine() {
    if (gFrame % 10 == 9) {
        gContext.fillStyle = '#888';
        gContext.fillRect(gPos, 0, 1, gCanvas.height);
    }
    else {
        gContext.clearRect(gPos, 0, 1, gCanvas.height);
    }
}

// Converts a key volume to an indicator of the "notch" with colors and style.
// Return object format:
//  {
//      notch:  index of gNotch[]
//      color1: color in gNotch[notch]
//      color2: color in gNotch[notch + 1]
//      interpolation: the [0.00 .. 1.00] percentage between 'color1' and 'color2'
//      style:  style used for drawing. likely based on interpolation.
//  }
function volumeToNotch(volume) {
    let notch, low, high, style, color1, color2, interpolation;

    // Search for the lower and upper notche that 'volume' belongs to.
    for (let i = 0; i < MAX_NOTCHES; i++) {
        // Handle cases that are beyond the limits in gNotches[].
        if ((i == MAX_NOTCHES - 1) ||
            (i == 0 && i < gNotches[0].volume))
        {
            notch  = i;
            low    = gNotches[i].volume;
            high   = MAX_VELOCITY;
            color1 = gNotches[i].color;
            color2 = gNotches[i].color;
            style  = DRAW_COLOR1;
            interpolation = 0.00;
            break;
        }
        // Handle all other cases (between or at notches).
        else if (volume >= gNotches[i + 0].volume &&
                 volume <  gNotches[i + 1].volume)
        {
            notch  = i;
            low    = gNotches[i + 0].volume;
            high   = gNotches[i + 1].volume;
            color1 = gNotches[i + 0].color;
            color2 = gNotches[i + 1].color;
            style  = undefined;
            break;
        }
    }

    // Determine interpolation if not explicitly defined.
    if (interpolation === undefined && low !== undefined && high !== undefined)
        interpolation = (volume - low) / (high - low);

    // Determine style and interpolation.
    if (style === undefined && interpolation !== undefined) {
        style = (interpolation < 0.25) ? DRAW_COLOR1      :
                (interpolation < 0.50) ? DRAW_COLOR1_LINE :
                (interpolation < 0.75) ? DRAW_STRIPES     :
                                         DRAW_COLOR2_LINE;
    }

    return {
        notch:  notch,
        color1: color1,
        color2: color2,
        interpolation: interpolation,
        style:  style,
    };
}

// Draws a single line at the current position (gPos).
function drawMidiLine() {
    // Draw all keys.
    for (let i = 0; i < MAX_KEYS; i++) {
        // Skip keys that aren't pressed.
        if (gKeys[i] == null)
            continue;

        // Calculate line positions.
        let y1 = gCanvas.height - (gPixelsPerNote * (i + 1));
        let y2 = gCanvas.height - (gPixelsPerNote * (i + 0));

        // Calculate position for small line in the middle of the big line.
        let split1 = y1 + gMiddleOffset;
        let split2 = y2 - gMiddleOffset;

        // Get all info for drawing.
        let notch = volumeToNotch(gKeys[i].volume);

        // Draw based on 'notch.style'.
        switch (notch.style) {
            case DRAW_COLOR1:
                gContext.fillStyle = notch.color1;
                gContext.fillRect(gPos, y1, 1, y2 - y1);
                break;

            case DRAW_COLOR1_LINE:
                gContext.fillStyle = notch.color1;
                gContext.fillRect(gPos, y1,     1, split1 - y1);
                gContext.fillRect(gPos, split2, 1, y2     - split2);
                gContext.fillStyle = notch.color2;
                gContext.fillRect(gPos, split1, 1, split2 - split1);
                break;

            case DRAW_STRIPES:
                gContext.fillStyle = (gPos % 2 == 0)
                    ? notch.color1 : notch.color2;
                gContext.fillRect(gPos, y1, 1, y2 - y1);
                break;

            case DRAW_COLOR2_LINE:
                gContext.fillStyle = notch.color2;
                gContext.fillRect(gPos, y1,     1, split1 - y1);
                gContext.fillRect(gPos, split2, 1, y2     - split2);
                gContext.fillStyle = notch.color1;
                gContext.fillRect(gPos, split1, 1, split2 - split1);
                break;
        }
    }
}

// Moves the cursor forward. Run after every animation frame.
function updatePosition() {
    gPos = (gPos + 1) % gCanvas.width;
    gFrame++;
}

// Draws the line indicating gPos.
function drawPositionLine() {
    gContext.fillStyle = '#080';
    gContext.fillRect(gPos, 0, 1, gCanvas.height);
}

// Queues drawing the next frame and all subsequent frames.
function queueAnimFrame() {
    requestAnimationFrame(function() {
        animFrame();
        if (gRunning)
            queueAnimFrame();
    });
}

// Begins drawing the sequencer.
function startRunning() {
    if (gRunning === true)
        return;
    gRunning = true;

    drawPositionLine();
    queueAnimFrame();
}

// Toggles the 'fullscreen' class for the <body> and #display elements.
function toggleFullscreen() {
    // Determine which class to append - 'fullscreen' or nothing.
    gFullscreenOn = !gFullscreenOn;
    let fsClass = (gFullscreenOn ? ' fullscreen' : '');

    // Set classes.
    gBody.className  = gOrigBodyClass  + fsClass;
    gInput.className = gOrigInputClass + fsClass;
}

//
// Program execution
//

// Initialize and run!
init();
