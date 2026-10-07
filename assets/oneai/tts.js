var speechOn = false;

function toggleSpeech() {
	if (!speechOn) {
		$('#speech-btn').html('<i class="fa-solid fa-volume-high fa-2xl" style="color: #ffffff;"></i>');
		speechOn = true;
	}
	else {
		$('#speech-btn').html('<i class="fa-solid fa-volume-xmark fa-2xl" style="color: #ffffff;"></i>');
		speechOn = false;
	}
}

function say(text) {
	if (speechOn) {
		return systemSpeech(text);
	}
}

function systemSpeech(response) {
	var msg = new SpeechSynthesisUtterance(response);
	window.speechSynthesis.speak(msg);
	// setTimeout(function() {
	// 	toggleBg("off");
	// }, response.length * 77);
}