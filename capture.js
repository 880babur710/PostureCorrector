let imageCapture;
let videoTrack;
let webcamRunning = false;
let sandboxIsReady = false;
const videoElement = document.getElementById('webcam');
const pitchElement = document.querySelector('#pitch .value');
const distanceElement = document.querySelector('#distance .value');
const timeElement = document.querySelector('#time .value');
const sandboxElement = document.getElementById('sandboxFrame');
let canvas, ctx;
let consecutiveBadPostureDuration;
let currentTimeWindow;
let lastTimeWindowDate;
let currentTimeWindowBadPostureDuration;
let timewindowIntervalId;
let warningMethod;
let frameRate;
let currentActivity;
let currentActivityBadPostureDuration;
let currentActivityDuration;
let currentActivityTimestamp;
let startTimestamp;
let data;
let selectedWebcam;
let buffer, array;
let DOMContentLoaded = false;
let sandboxLoaded = false;
let width, height;
let sandboxSharedBufferReady = false;


document.addEventListener('DOMContentLoaded', function() {
    DOMContentLoaded = true;
    chrome.runtime.sendMessage({ type: 'captureIsReady' });
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'webcam') {
            startWebcam(message.selectedWebcam);
        } else if (message.type === 'saveGoodPosture') {
            sandboxElement.contentWindow.postMessage({ type: 'saveGoodPosture'}, '*');
            startTimestamp = Date.now();
            currentActivityTimestamp = startTimestamp;
            if (!data.goodPostureSaved) { 
                updateDailyStatistics();
                data.lastUsedDateStr = new Date(startTimestamp).toDateString();
                checkTimewindow();
                data.goodPostureSaved = true;
            }
        } else if (message.type === 'warningMethod') {
            setWarningMethod(message.warningMethod);
        } else if (message.type === 'activity') {
            if (!currentActivity) {
                currentActivity = message.activity;
            } else {
                updateActivityStatistics(message.activity);
            }
        } else if (message.type === 'closeCaptureTab') {
            webcamRunning = false;
            prepareForTabClosing();
            chrome.storage.local.set({ statistics: data });
            chrome.runtime.sendMessage({ type: 'captureIsReadyToClose' });
        }
    });
});


function saveDataPeriodically() {
    const endTimestamp = Date.now();
    data.dailyDuration += endTimestamp - startTimestamp;
    startTimestamp = endTimestamp;

    updateActivityStatistics(currentActivity);

    chrome.storage.local.set({ statistics: data });
}


function startWebcam(deviceId) {
    const constraints = {
        video: {
            deviceId: deviceId ? { exact: deviceId } : undefined
        },
        audio: false
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            videoElement.srcObject = stream;

            // Wait for the video to be properly initialized
            videoElement.onloadedmetadata = () => {
                webcamRunning = true;
                width = videoElement.videoWidth;
                height = videoElement.videoHeight;
                sandboxElement.contentWindow.postMessage({ type: 'frameSize', width: width, height: height }, '*');
                buffer = new ArrayBuffer(width * height * 4);  // RGBA

                canvas = new OffscreenCanvas(width, height);
                canvas.width = width;
                canvas.height = height;
                ctx = canvas.getContext('2d', { willReadFrequently: true });
                // array = new Uint8ClampedArray(buffer);
                captureAndSendFrame();
            };
        })
        .catch(err => {
            console.error("[Error accessing webcam] " + err);
        });
}


function captureAndSendFrame() {
    if (!sandboxIsReady){
        setTimeout(captureAndSendFrame, 500);
    }

    if (webcamRunning) {
        ctx.drawImage(videoElement, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        new Uint8Array(buffer).set(imageData.data);

        sandboxElement.contentWindow.postMessage({ 
            type: 'processFrame',
            buffer: buffer
        }, '*', [buffer]);
        
        buffer = new ArrayBuffer(width * height * 4);
        console.log("Sent raw frame");
        setTimeout(captureAndSendFrame, frameRate);
    }
}


// Messages from sandbox.js
window.addEventListener('message', (event) => {
    if (event.data.type === 'sandboxIsReady') { 
        console.log("Sandbox is ready");
        sandboxIsReady = true;
    } else if (event.data.type === 'sendNotification') {
        chrome.runtime.sendMessage({ type: 'sendNotification' });
    } else if (event.data.type === 'blurScreen') {
        chrome.runtime.sendMessage({ type: 'blurScreen' });
    } else if (event.data.type === 'unblurScreen') {
        chrome.runtime.sendMessage({ type: 'unblurScreen' });
    } else if (event.data.type === 'result') {
        // console.log("Received results");
        updateBadPostureDuration(event.data.duration);
        pitchElement.textContent = `${event.data.pitch} degrees`;
        distanceElement.textContent = `${event.data.distance} cm`;
        timeElement.textContent = `${event.data.duration} seconds`;
    }
});


async function initializeData() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['statistics'], (result) => {
            if (result.statistics !== undefined) {
                data = result.statistics;
            } else {
                data = {
                    goodPostureSaved: false,
                    dailyBadPostureDuration: 0,
                    dailyDuration: 0,
                    lastUsedDateStr: '',
                    cumulativeTimeWindowDuration: [
                        { name: '0to3am', bad: 0, total: 0 },
                        { name: '3to6am', bad: 0, total: 0 },
                        { name: '6to9am', bad: 0, total: 0 },
                        { name: '9to12pm', bad: 0, total: 0 },
                        { name: '12to3pm', bad: 0, total: 0 },
                        { name: '3to6pm', bad: 0, total: 0 },
                        { name: '6to9pm', bad: 0, total: 0 },
                        { name: '9to0am', bad: 0, total: 0 }
                    ],
                    cumulativeWorkDuration: { bad: 0, total: 0 },
                    cumulativeStudyDuration: { bad: 0, total: 0 },
                    cumulativeEntertainmentDuration: { bad: 0, total: 0 },
                    longestGoodPostureDuration: 0,
                    badPosturePercentageLast30Days: [],
                    lowestBadPosturePercentage: undefined,
                    highestBadPosturePercentage: undefined,
                };
            }
            resolve();
        });
    });
}


async function waitForData() {
    await initializeData();
}

waitForData();


function updateDailyStatistics() {
    const currentDateStr = new Date().toDateString();
    if (currentDateStr !== data.lastUsedDateStr) {
        const lastDayPercentage = (data.dailyBadPostureDuration / data.totalDuration) * 100;
        const lastDayData = { 
            date: data.lastUsedDateStr, 
            badPostureDuration: data.dailyBadPostureDuration, 
            totalDuration: data.totalDuration, 
            badPosturePercentage: lastDayPercentage 
        };
        data.badPosturePercentageLast30Days.push(lastDayData);
        
        const maxPercentage = data.highestBadPosturePercentage;
        const minPercentage = data.lowestBadPosturePercentage;
        if (maxPercentage === undefined || lastDayPercentage > maxPercentage) {
            data.highestBadPosturePercentage = lastDayPercentage;
        } else if (minPercentage === undefined || lastDayPercentage < minPercentage) {
            data.lowestBadPosturePercentage = lastDayPercentage;
        }

        data.dailyBadPostureDuration = 0;
        data.totalDuration = 0;
    }
}


function updateBadPostureDuration(badPostureDuration) {
    if (badPostureDuration > 0) {
        consecutiveBadPostureDuration = badPostureDuration;
    } else if (badPostureDuration === 0 && consecutiveBadPostureDuration > 0) {
        currentTimeWindowBadPostureDuration += consecutiveBadPostureDuration;
        currentActivityBadPostureDuration += consecutiveBadPostureDuration;
        data.dailyBadPostureDuration += consecutiveBadPostureDuration;
        if (consecutiveBadPostureDuration > data.longestGoodPostureDuration) {
            data.longestGoodPostureDuration = consecutiveBadPostureDuration;
        }
        consecutiveBadPostureDuration = 0;
    }
}


function updateTimewindowStatistics() {
    const currentDate = new Date();
    const hour = currentDate.getHours();
    const newWindow = Math.floor(hour / 3);

    if (newWindow === currentTimeWindow) {
        let timeWindowData = data.cumulativeTimeWindowDuration[currentTimeWindow];
        timeWindowData.bad += currentTimeWindowBadPostureDuration;
        timeWindowData.total += currentDate - lastTimeWindowDate;
        currentTimeWindowBadPostureDuration = 0;
    }
    if (currentTimeWindow !== undefined) {
        updateTimewindowStatistics(currentDate, currentTimeWindow);
    }
    currentTimeWindow = newWindow;
    lastTimeWindowDate = currentDate;

    const minutesUntilNextWindow = 180 - (hour % 3) * 60 - currentDate.getMinutes();
    const millisecondsUntilNextWindow = minutesUntilNextWindow * 60 * 1000;

    clearInterval(timewindowIntervalId);
    timewindowIntervalId = setTimeout(checkTimewindow, millisecondsUntilNextWindow);
}


function checkTimewindow() {
    const currentDate = new Date();
    const hour = currentDate.getHours();
    const newWindow = Math.floor(hour / 3);

    if (newWindow !== currentTimeWindow) {
        if (currentTimeWindow !== undefined) {
            updateTimewindowStatistics(currentDate, currentTimeWindow);
        }
        currentTimeWindow = newWindow;
        lastTimeWindowDate = currentDate;

        const minutesUntilNextWindow = 180 - (hour % 3) * 60 - currentDate.getMinutes();
        const millisecondsUntilNextWindow = minutesUntilNextWindow * 60 * 1000;

        clearInterval(timewindowIntervalId);
        timewindowIntervalId = setTimeout(checkTimewindow, millisecondsUntilNextWindow);
    }
}


function updateTimewindowStatistics(currentDate, timewindowIndex) {
    let timeWindowData = data.cumulativeTimeWindowDuration[timewindowIndex];
    timeWindowData.bad += currentTimeWindowBadPostureDuration;
    timeWindowData.total += currentDate - lastTimeWindowDate;
    currentTimeWindowBadPostureDuration = 0;
}


function updateActivityStatistics(newActivity) {
    const nextTimestamp = Date.now();
    currentActivityDuration = (nextTimestamp - currentActivityTimestamp);
    currentActivityTimestamp = nextTimestamp;

    if (currentActivity === 'work') {
        data.cumulativeWorkDuration.bad += currentActivityBadPostureDuration;
        data.cumulativeWorkDuration.total += currentActivityDuration;
    } else if (currentActivity === 'study') {
        data.cumulativeStudyDuration.bad += currentActivityBadPostureDuration;
        data.cumulativeStudyDuration.total += currentActivityDuration;
    } else if (currentActivity === 'entertainment') {
        data.cumulativeEntertainmentDuration.bad += currentActivityBadPostureDuration;
        data.cumulativeEntertainmentDuration.total += currentActivityDuration;
    }

    currentActivity = newActivity;
    currentActivityBadPostureDuration = 0;
}


function setWarningMethod(warningMethod) {
    sandboxElement.contentWindow.postMessage({ 
        type: 'warningMethod', warningMethod: warningMethod
    }, '*');
    if (warningMethod === 'notification') {
        frameRate = 2500;
    } else if (warningMethod === 'blur') {
        frameRate = 500;
    }
}


function prepareForTabClosing() {
    webcamRunning = false;
    const endTimestamp = Date.now();
    data.dailyDuration += endTimestamp - startTimestamp;
    data.goodPostureSaved = false;

    updateActivityStatistics(currentActivity);
}