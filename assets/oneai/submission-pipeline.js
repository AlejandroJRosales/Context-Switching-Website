var isMobile = getDeviceType();
var screenHeight = getScreenHeight();
var dispalyNewTab = false;
var responseResult;
var i = 0;
var speed = 3; /* The speed/duration of the effect in milliseconds */

$(document).ready(function () {
  var chatboxBottomPadding = screenHeight * .1 + 'px';
  // var oneaiCollapseW = (18 * 1) + 'em';
  var oneaiCollapseH = 2.5 + 'em';
  var oneaiCollapseW = 270 + 'px';
  if (!isMobile) {
    oneaiCollapseW = 250 + 'px';
  }
  $("#textbox-area").html('<textarea type="text" id="user-input-box" style="left:2;min-width:' + oneaiCollapseW + ';max-width:' + oneaiCollapseW + ';min-height:' + oneaiCollapseH + ';max-height:' + oneaiCollapseH + '" name="query" placeholder="Message"></textarea>');
  $("#textbox-area").css({ "margin-bottom": "12px" });

  setTimeout(() => {
    // toggleBg("on");
    document.getElementById("ai-response").innerHTML = "Hi, I'm a Cloud A.I. coded by Alejandro, the creator of this website. Ask me things like, \"What is Hilbert Space\", \"Go to the math page\", or \"Turn on dark mode\". For more ask me, \"What can you do?\".";
  }, 500);
});

function handleMessage(query, queryLowered, uid) {
  $('#submit-query-btn').html('<i class="fa-regular fa-paper-plane fa-2xl" style="color: #ffffff;"></i>');
  clearInputBox();
  $('#submit-query-btn').prop("disabled", false);
  if (!localCommand(query)) {
    sendToServer(query, uid);
  }
}

function localCommand(query) {
  let queryLowered = query.toLowerCase();
  if (queryLowered.indexOf("off") >= 0 && queryLowered.indexOf("mode") >= 0) {
    if (queryLowered.indexOf("light") >= 0 && queryLowered.indexOf("mode") >= 0) {
      if (localStorage.getItem('isDarkMode') === 'false') {
        localStorage.setItem('isDarkMode', true);
        currentSpeaker = "Jarcey A.I."
        handleResponse("Okay, I have set the website to dark mode.");
      }
      else {
        currentSpeaker = "Jarcey A.I."
        handleResponse("You are already in dark mode.");
      }
      applyModeStyle();
      return true;
    }
    else if (queryLowered.indexOf("dark") >= 0 && queryLowered.indexOf("mode") >= 0) {
      if (localStorage.getItem('isDarkMode') === 'true') {
        localStorage.setItem('isDarkMode', false);
        currentSpeaker = "Jarcey A.I."
        handleResponse("Alright, I have set the website to light mode.");
      }
      else {
        currentSpeaker = "Jarcey A.I."
        handleResponse("You are already in light mode.");
      }
      applyModeStyle();
      return true;
    }
  }
  else if (queryLowered.indexOf("on") >= 0 && queryLowered.indexOf("mode") >= 0) {
    if (queryLowered.indexOf("light") >= 0 && queryLowered.indexOf("mode") >= 0) {
      if (localStorage.getItem('isDarkMode') === 'true') {
        localStorage.setItem('isDarkMode', false);
        currentSpeaker = "Jarcey A.I."
        handleResponse("Okie doke, I have set the website to light mode.");
      }
      else {
        currentSpeaker = "Jarcey A.I."
        handleResponse("You are already in light mode.");
      }
      applyModeStyle();
      return true;
    }
    else if (queryLowered.indexOf("dark") >= 0 && queryLowered.indexOf("mode") >= 0) {
      if (localStorage.getItem('isDarkMode') === 'false') {
        localStorage.setItem('isDarkMode', true);
        currentSpeaker = "Jarcey A.I."
        handleResponse("Alright, I have set the website to dark mode.");
      }
      else {
        currentSpeaker = "Jarcey A.I."
        handleResponse("You are already in dark mode.");
      }
      applyModeStyle();
      return true;
    }
  }

  else if (queryLowered.indexOf("home") >= 0) {
    window.location.href = "/";
    return true;
  }

  else if (queryLowered.indexOf("explore") >= 0) {
    window.location.href = "/explore";
    return true;
  }

  else if (queryLowered.indexOf("neuro") >= 0 && queryLowered.indexOf("page") >= 0) {
    window.location.href = "/neuro";
    return true;
  }

  else if (queryLowered.indexOf("math") >= 0 && queryLowered.indexOf("page") >= 0) {
    window.location.href = "/math";
    return true;
  }

  else if (queryLowered.indexOf("computer science") >= 0 && queryLowered.indexOf("page") >= 0) {
    window.location.href = "/tcs";
    return true;
  }

  else if (queryLowered.indexOf("misc") >= 0 && queryLowered.indexOf("page") >= 0) {
    window.location.href = "/misc";
    return true;
  }

  else if (queryLowered.indexOf("about") >= 0 && queryLowered.indexOf("me") >= 0) {
    window.location.href = "/my/aboutme";
    return true;
  }

  else if (queryLowered.indexOf("website") >= 0 && queryLowered.indexOf("dedicate") >= 0) {
    currentSpeaker = "Jarcey A.I."
    handleResponse("This website is dedicated to PK and Lucy, Alejandro's best boy and best girl.");
    return true;
  }

  else if (queryLowered.indexOf("party mode") >= 0) {
    currentSpeaker = "Jarcey A.I."
    handleResponse("If you insist.");
    partyMode();
    return true;
  }
  return false
}

function sendToServer(query, uid) {
  url = buildURL(query, uid);

  handleResponse(query);
  $.ajax({
    url: url,
    type: "GET",
    success: function (result) {
      currentSpeaker = "Jarcey A.I."
      handleResponse(result);
    },
    error: function (xhr, status, error) {
      $('#submit-query-btn').prop("disabled", false);
      displayUrl(url);
    }
  });
}

function downloadContentFromServer(query, uid, filename) {
  $.ajax({
    url: url,
    type: "GET",
    success: function (result) {
      downloadContent(filename, result);
    },
    error: function (xhr, status, error) {
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
