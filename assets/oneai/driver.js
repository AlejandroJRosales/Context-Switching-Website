// $(document).ready(function() {
// 	$("html").css({
// 		"background": "black no-repeat center center fixed",
// 		"background-position": "50% 50%",
// 		"-webkit-background-size": "cover",
// 		"-moz-background-size": "cover",
// 		"-o-background-size": "cover",
// 		"background-size": "cover",
// 	});
// });

function submitQuery() {
	var query = $('#user-input-box').val();
	if (query === "") {
		alert("Please write a message before pressing send.");
		return;
	}
	var queryLowered = query.toLowerCase();

	var uid = "Web";

	$('#submit-query-btn').prop("disabled", true);
	$('#submit-query-btn').html('<i class="fa-regular fa-paper-plane fa-2xl" style="color: #949494;"></i>');

	currentSpeaker = "You";
	handleMessage(query, queryLowered, uid);
}

function settings() {
	window.open("/settings.html", '_blank').focus();
}

function clearInputBox() {
	$('#user-input-box').val("");
}

function displayLoginBox() {
	if ($("#user-id-box").is(":visible")) {
		$("#user-id-box").css({ "display": "none", "visibility": "hidden" });
	}
	else {
		$("#user-id-box").css({ "display": "inline", "visibility": "visible" });
	}
}
