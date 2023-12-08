var responseTxt = "";
var speed = 100;
var currCharIdx = 0;
var currentSpeaker = "Jarcey A.I."
var endpoint = "https://api.oneai.cloud/user"

function getDeviceType() {
	const toMatch = [
		/Android/i,
		/webOS/i,
		/iPhone/i,
		/iPad/i,
		/iPod/i,
		/BlackBerry/i,
		/Windows Phone/i
	];

	return toMatch.some((toMatchItem) => {
		return navigator.userAgent.match(toMatchItem);
	});
}

function getCurrentSpeaker() {

}

function getScreenHeight() {
	return $(window).height();
}

function buildURL(query, uid) {
	queryURI = encodeURIComponent(query);
	url = endpoint + '?input=' + queryURI + '&uid=' + uid;
	return url;
}

function downloadContent(filename, text) {
	$('.chatbox').html("<p>downloading content...</p>");

	var element = document.createElement('a');
	element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
	element.setAttribute('download', filename);

	element.style.display = 'none';
	document.body.appendChild(element);

	element.click();

	document.body.removeChild(element);
	$('.chatbox').html("<p>content downloaded...</p>");
}

function formatForDisplay(text) {
	// todo: need to make function
	// if message from server
	return '<p>" ' + text + ' "</p>';
}

function getTime() {
	// todo: redo fucntion and CLEAN UP ALL CODE IN SUBMISSION PIPELINE AND UTILS... and prob index
	var dt = new Date();
	var time = dt.getHours() + ":" + dt.getMinutes() + ":" + dt.getSeconds();
	// use in console where write is code again(?)
	return time;
}

function typeWriter(txt) {
	responseTxt = txt;
	currCharIdx = 1;
	addChar(txt);
}

function addChar() {
	if (currCharIdx < responseTxt.length + 1) {
		document.getElementById("ai-response").innerText = responseTxt.substring(0, currCharIdx);
		// $('#ai-response').text(responseTxt.substring(0, currCharIdx));
		currCharIdx++;
		setTimeout(addChar, speed);
	}
	else if (!speechOn && currentSpeaker !== "You") {
		toggleBg("off");
	}
}
