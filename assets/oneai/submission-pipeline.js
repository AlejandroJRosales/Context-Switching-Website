// who is who from comments
// no server

var isMobile = getDeviceType();
var screenHeight = getScreenHeight();
var dispalyNewTab = false;
var responseResult;
var i = 0;
var speed = 3; /* The speed/duration of the effect in milliseconds */

$(document).ready(function() {
	var chatboxBottomPadding = screenHeight * .24 + 'px';
	$("#textbox-area").html('<textarea type="text" id="user-input-box" rows="1" cols="30" name="query" placeholder="Message"></textarea>');
	$("#textbox-area").css({ "margin-bottom": "12px" });

	setTimeout(() => {
		// toggleBg("on");
		handleResponse("I'm a cloud based artificial intelligence coded by Alejandro Rosales, the creator of this website. Here, my purpose is to answer questions you have. For more features ask, \"What can you do?\" Press the airplane to submit input.");
	}, 500);
});

function handleMessage(query, queryLowered, uid) {
	// toggleBg("on");
	sendToServer(query, uid);
}

function sendToServer(query, uid) {
	url = buildURL(query, uid);

	handleResponse(query);
	$.ajax({
		url: url,
		type: "GET",
		success: function(result) {
			$('#submit-query-btn').html('<i class="fa-regular fa-paper-plane fa-2xl" style="color: #ffffff;"></i>');
			clearInputBox();
			$('#submit-query-btn').prop("disabled", false);
			currentSpeaker = "Jarcey A.I."
			handleResponse(result);
		},
		error: function(xhr, status, error) {
			$('#submit-query-btn').html('<i class="fa-regular fa-paper-plane fa-2xl" style="color: #ffffff;"></i>');
			clearInputBox();
			$('#submit-query-btn').prop("disabled", false);
			displayUrl(url);
		}
	});
}

function downloadContentFromServer(query, uid, filename) {
	$.ajax({
		url: url,
		type: "GET",
		success: function(result) {
			downloadContent(filename, result);
		},
		error: function(xhr, status, error) {
			// alert("Result: " + status + " " + error + " " + xhr.status + " " + xhr.statusText);
			displayResponse("Something went wrong.");
			displayUrl(error, url);
		}
	});
}

function handleResponse(text) {
	document.getElementById("ai-response").innerHTML = "";
	$('#current-speaker').text(currentSpeaker);

	typeWriter(text);

	if (currentSpeaker !== "You") {
		say(text);
	}

	// if (from !== "You" && text.includes("<iframe")) {
	// if (false) {
	// 	var tab = window.open('about:blank', '_blank');
	// 	tab.document.write('<!doctype html><html><head><title>' + "Streaming..." + '</title><meta charset="UTF-8" /></head><body style="padding: 0; margin: 0;">' + '<video controls style="width: 100%; height: 100vh;"><source src="https://1drv.ms/v/s!AmdYV4GwXOIwiONleLD2kurt60kjyA?e=uQjI7i" type="video/mp4"/></video>' + '</body></html>');
	// 	tab.document.close();
	// 	tab.focus()
	// }
}

function displayUrl(error, url) {
	$('#ai-response').html('<p>Something went wrong.\n\nError:\n\n'
		+ error + 'Generated URL:\n\n<a href="'
		+ url + '">'
		+ url + '</a></p>');
}

function toggleBg(state) {
	// $("html").css({ "background-image": "url(assets/imgs/ai-" + state + ".png)" });
}

// $("#copy-btn").on('click', function() {

// }
