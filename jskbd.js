const ERROR_NO_MIDI_DEVICES = "No MIDI input devices detected.";
const ERROR_UNHANDLED_EVENT = "Unhandled event";

const MAX_VELOCITY = 127.00;
const LOW_KEY = 21;
const MAX_KEYS = 88;

const DRAW_COLOR1      = 'color1'
const DRAW_COLOR1_DOTS = 'color1-dots'
const DRAW_STRIPES     = 'stripes'
const DRAW_COLOR2_DOTS = 'color2-dots'

const CANVAS_WIDTH  = 60 * 8;
const CANVAS_HEIGHT = MAX_KEYS * 8;

const gCanvas = document.getElementById('display');
const gContext = gCanvas.getContext('2d');
const gKeys = Array(MAX_KEYS).fill(null);

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

const MAX_NOTCHES = gNotches.length;

gCanvas.width  = CANVAS_WIDTH;
gCanvas.height = CANVAS_HEIGHT;

let gInputs = null;
let gPos = 0;
let gFrame = 0;
let gRunning = false;

function errorAlert(message) {
    alert(message);
}

function errorLog(message) {
    console.error(message);
}

function initMidi(access) {
    gInputs = access.inputs;

    let count = 0;
    for (let input of gInputs.values()) {
        registerInput(input);
        count++;
    }
    if (count == 0) {
        errorAlert(ERROR_NO_MIDI_DEVICES);
        return;
    }

    startDrawing();
}

let honk = null;

function handleMidiMessage(message) {
    var data = message.data;

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

        default:
            errorLog(ERROR_UNHANDLED_EVENT + ": " + data);
            break;
    }
}

function registerInput(input) {
    input.onmidimessage = handleMidiMessage;
}

function midiKeyToArrayKey(midiKey) {
    if (midiKey < LOW_KEY || midiKey >= (LOW_KEY + MAX_KEYS))
        return null;
    return midiKey - LOW_KEY;
}

function velocityToVolume(velocity) {
    return velocity / MAX_VELOCITY;
}

function eventNoteOff(midiKey) {
    let key = midiKeyToArrayKey(midiKey);
    if (key == null)
        return;
    gKeys[key] = null;
}

function eventNoteOn(midiKey, velocity) {
    let key = midiKeyToArrayKey(midiKey);
    if (key == null)
        return;
    gKeys[key] = velocityToVolume(velocity);
}

function animFrame() {
    clearLine();
    drawMidiLine();
    updatePosition();
    drawPositionLine();
}

function clearLine() {
    if (gFrame % 10 == 9) {
        gContext.fillStyle = '#888';
        gContext.fillRect(gPos, 0, 1, gCanvas.height);
    }
    else {
        gContext.clearRect(gPos, 0, 1, gCanvas.height);
    }
}

function volumeToNotch(volume) {
    let notch, low, high, style, color1, color2;

    console.log(volume);
    for (let i = 0; i < MAX_NOTCHES; i++) {

        if (i == MAX_NOTCHES - 1) {
            notch  = i;
            low    = gNotches[i].volume;
            high   = MAX_VELOCITY;
            color1 = gNotches[i].color;
            color2 = gNotches[i].color;
            style  = DRAW_COLOR1;
            break;
        }
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

    if (style === undefined && low !== undefined && high !== undefined) {
        let dist = (high - low);
        let interpolation = (volume - low) / dist;
        style = (interpolation < 0.25) ? DRAW_COLOR1      :
                (interpolation < 0.50) ? DRAW_COLOR1_DOTS :
                (interpolation < 0.75) ? DRAW_STRIPES     :
                                         DRAW_COLOR2_DOTS;
    }

    return {
        notch:  notch,
        color1: color1,
        color2: color2,
        style:  style
    };
}

function drawMidiLine() {
    let pixelsPerNote = gCanvas.height / MAX_KEYS;

    for (let i = 0; i < MAX_KEYS; i++) {
        if (gKeys[i] == null || gKeys[i] <= 0)
            continue;

        let y1 = gCanvas.height - (pixelsPerNote * (i + 1));
        let y2 = gCanvas.height - (pixelsPerNote * (i + 0));

        let split1 = y1 + (pixelsPerNote / 2.0);
        let split2 = split1 + 1;

        let notch = volumeToNotch(gKeys[i]);
        console.log(notch);

        // TODO: actual drawing!
        switch (notch.style) {
            case DRAW_COLOR1:
                gContext.fillStyle = notch.color1;
                gContext.fillRect(gPos, y1, 1, y2 - y1);
                break;

            case DRAW_COLOR1_DOTS:
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

            case DRAW_COLOR2_DOTS:
                gContext.fillStyle = notch.color2;
                gContext.fillRect(gPos, y1,     1, split1 - y1);
                gContext.fillRect(gPos, split2, 1, y2     - split2);
                gContext.fillStyle = notch.color1;
                gContext.fillRect(gPos, split1, 1, split2 - split1);
                break;
        }
    }
}

function updatePosition() {
    gPos = (gPos + 1) % gCanvas.width;
    gFrame++;
}

function drawPositionLine() {
    gContext.fillStyle = '#080';
    gContext.fillRect(gPos, 0, 1, gCanvas.height);
}

function runAnimFrame() {
    requestAnimationFrame(function() {
        animFrame();
        if (gCanvasRunning)
            runAnimFrame();
    });
}

function startDrawing() {
    gCanvasRunning = true;

    drawPositionLine();
    runAnimFrame();
}

// Activate MIDI.
navigator
    .requestMIDIAccess()
    .then(initMidi);
