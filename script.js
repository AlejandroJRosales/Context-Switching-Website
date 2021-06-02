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
    $(".nav-bar-brand").css({"font-size": "1em"});
    $(".code").css({"font-size": "75%"});
    $(".collapsible-contents-button").css({"bottom": "7%", "right": "3%"});
    $(".information").css({"padding-left": "6%", "padding-right": "6%", "margin-left": "4%", "margin-right": "4%"});
		$(".website-title").css({"font-size": "1.5em"});
		$(".website-creator").css({"font-size": ".8em"});
		$(".homepage-info").css({"font-size": ".73em"});
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
    if ($("button").html() == "X") {
      $("button").html("Table of Contents");
    } 
    if ($("button").html() == "Table of Contents") {
      $("button").html("X");
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