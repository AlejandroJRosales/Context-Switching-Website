$(function() {
    $(".nav-placeholder").load("/navbar.html");
    $(".footer-placeholder").load("/footer.html");
});

function isMobile() {
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

$(document).ready(function(){
	var paddingPxTop = String($(window).height() * .35) + "px";
	var paddingPxBottom = String($(window).height() * .65) + "px";
	$(".website-intro").css({"padding-top": paddingPxTop, "padding-bottom": paddingPxBottom});
});

$(document).ready(function(){ 
  if (isMobile()) {
    // $(".topics-dropdown-menu").css({"padding-bottom": "2%"});
    $(".code").css({"font-size": "75%"});
    $(".collapsible-contents-button").css({"bottom": "7%", "right": "3%"});
    $(".information").css({"padding-left": "6%", "padding-right": "6%"});
		$(".website-title").css({"font-size": "1.5em"});
		$(".website-creator").css({"font-size": ".8em"});
    // $(".text-box").css({"max-height": "15em", "overflow:": "auto"});
  }
});

window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']]
  }
};

$(document).ready(function() { 
  $("button").click(function() { 
    // Change text of button element
    if ($("#algorithmic-analysis-contents-button").html() == "Close") {
      $("#algorithmic-analysis-contents-button").html("Table of Contents");
    } 
    else {
      $("#algorithmic-analysis-contents-button").html("Close");
    } 
  }); 
});

$(document).ready(function() { 
  $("#pills-about-website").click(function() { 
    // Change text of button element
    console.log("clicked");
  }); 
});

function openSearch() {
  document.getElementById("myOverlay").style.display = "block";
}

function closeSearch() {
  document.getElementById("myOverlay").style.display = "none";
}