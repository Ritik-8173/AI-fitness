const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');

const counterDisplay = document.getElementById('counter');
const timerDisplay = document.getElementById('timer');
const stageDisplay = document.getElementById('stage');
const progressBar = document.getElementById('progress-bar');
const statusLabel = document.getElementById('status-label');
const exerciseSelect = document.getElementById('exercise-type');

let counter = 0;
let stage = "up"; 
let isRunning = false;
let hasReachedBottom = false; 
let isCalibrated = false; // Calibration flag
let seconds = 0;
let timerInterval = null;
let cameraInstance = null;

// Sound Synthesis for Calibration
function playPing() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch A5
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.5);
}

function findAngle(p1, p2, p3) {
    if(!p1 || !p2 || !p3) return 0;
    let angle = Math.abs(Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x)) * (180 / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
}

function formatTime(s) {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function onResults(results) {
    if (!isRunning) return;

    // Sync Canvas to Video Input Dimensions
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks) {
        // Calibration Sound Trigger
        if (!isCalibrated) {
            isCalibrated = true;
            playPing();
            statusLabel.innerText = "CALIBRATED";
            statusLabel.style.color = "#39ff14";
        }

        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#00d2ff', lineWidth: 4});
        drawLandmarks(canvasCtx, results.poseLandmarks, {color: '#fff', lineWidth: 1, radius: 3});

        const lm = results.poseLandmarks;
        let angle = 0;
        let upThreshold = 160; 
        let downThreshold = 90;

        // Exercise Logic
        switch(exerciseSelect.value) {
            case 'pushups':
                angle = findAngle(lm[11], lm[13], lm[15]); 
                upThreshold = 160; downThreshold = 95;
                break;
            case 'squats':
                angle = findAngle(lm[23], lm[25], lm[27]); 
                upThreshold = 165; downThreshold = 100;
                break;
            case 'curls':
                angle = findAngle(lm[11], lm[13], lm[15]); 
                upThreshold = 150; downThreshold = 50;
                break;
            case 'lunges':
                angle = findAngle(lm[24], lm[26], lm[28]); 
                upThreshold = 160; downThreshold = 110;
                break;
        }

        // Strict Rep Logic
        if (angle <= downThreshold) {
            if (!hasReachedBottom) {
                hasReachedBottom = true;
                stageDisplay.innerText = "GO UP";
                stageDisplay.style.color = "#ff3131"; 
            }
        }

        if (angle >= upThreshold && hasReachedBottom) {
            counter++;
            counterDisplay.innerText = counter;
            hasReachedBottom = false; 
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(counter));
            stageDisplay.innerText = "GO DOWN";
            stageDisplay.style.color = "#39ff14";
        }

        let per = Math.min(Math.max((angle - downThreshold) / (upThreshold - downThreshold) * 100, 0), 100);
        progressBar.style.width = `${100 - per}%`;
    } else {
        // Lost Calibration
        if (isCalibrated) {
            isCalibrated = false;
            statusLabel.innerText = "RE-CALIBRATING...";
            statusLabel.style.color = "#ffcc00";
        }
    }
    canvasCtx.restore();
}

const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});
pose.onResults(onResults);

// --- Buttons ---

document.getElementById('start-btn').addEventListener('click', async () => {
    if (isRunning) return;
    isRunning = true;
    isCalibrated = false;
    
    cameraInstance = new Camera(videoElement, {
        onFrame: async () => { if(isRunning) await pose.send({image: videoElement}); },
        width: 640, height: 480
    });
    
    await cameraInstance.start();

    timerInterval = setInterval(() => {
        seconds++;
        timerDisplay.innerText = formatTime(seconds);
    }, 1000);
});

document.getElementById('stop-btn').addEventListener('click', () => {
    isRunning = false;
    isCalibrated = false;
    clearInterval(timerInterval);
    
    if (cameraInstance) {
        const stream = videoElement.srcObject;
        if (stream) { stream.getTracks().forEach(track => track.stop()); }
        videoElement.srcObject = null;
    }

    statusLabel.innerText = "CAMERA OFF";
    statusLabel.style.color = "#ff3131";
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
});

document.getElementById('reset-btn').addEventListener('click', () => {
    document.getElementById('stop-btn').click();
    counter = 0; seconds = 0; hasReachedBottom = false;
    counterDisplay.innerText = "0";
    timerDisplay.innerText = "00:00";
    stageDisplay.innerText = "READY";
    progressBar.style.width = "0%";
});