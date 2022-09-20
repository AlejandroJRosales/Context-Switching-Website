$(function() {
	$(".nav-placeholder").load("/navbar.html");
	$(".footer-placeholder").load("/footer.html");
});

$(function() {
	var sectionHeaders = ["category-header", "section-header", "subsection-header", "subsubsection-header"]

	var tableOfContentsStr = "<h5>Links for Table of Contents</h5>";
	var lastHeaderIdx = 0;
	var currHeaderIdx = 0;

	// loop through the whole DOM tree using find(*)
	$(".information").find('*').each(function(index) {
		// get the section header name from the first paragraph tag
		var currentSectionName = $(this).find("p:first").attr('class');

		// make sure the node we are looking at is a section and is not categories definer
		if (typeof currentSectionName !== "undefined" && !$(this).hasClass('categories')) {
			currHeaderIdx = sectionHeaders.indexOf(currentSectionName);
			
			// header order: lGraph theory, c: simple graph
			if (currHeaderIdx > lastHeaderIdx) {
				tableOfContentsStr += '<ul><li><a href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';
				lastHeaderIdx = currHeaderIdx;
			}
			// header order: [last, current]
			else if (currHeaderIdx < lastHeaderIdx) {
				console.log(lastHeaderIdx - currHeaderIdx);
				console.log(lastHeaderIdx + " " + currHeaderIdx);
				for (var closeListCount = 0; closeListCount < lastHeaderIdx - currHeaderIdx; closeListCount++) {
					tableOfContentsStr += "</ul>"
				}
				tableOfContentsStr += '<li><a href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';
				lastHeaderIdx = currHeaderIdx;
			}
			else {
				if (currentSectionName === "category-header") {
					tableOfContentsStr += '<a href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a><br>';
				}
				else {
					tableOfContentsStr += '<li><a href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';
				}
			}
		}
	});
	$(".table-of-contents").append(tableOfContentsStr);
});

function tableContents() { }

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

$(document).ready(function() {
	var paddingPxTop = String($(window).height() * .35) + "px";
	var paddingPxBottom = String($(window).height() * .65) + "px";
	$(".website-intro").css({ "padding-top": paddingPxTop, "padding-bottom": paddingPxBottom });
});

$(document).ready(function() {
	if (isMobile()) {
		// $(".topics-dropdown-menu").css({"padding-bottom": "2%"});
		$(".nav-bar-brand").css({ "font-size": "1em" });
		$(".code").css({ "font-size": "75%", "margin": "10% 3% 10% 3%" });
		$(".collapsible-contents-button").css({ "bottom": "7%", "right": "3%" });
		$(".contents-button").css({ "margin-left": "2%" });
		$("#collapse").css({ "margin-left": "2%" });
		$(".information").css({ "padding-left": "6%", "padding-right": "6%", "margin-left": "4%", "margin-right": "4%" });
		$(".website-title").css({ "font-size": "1.5em" });
		$(".website-creator").css({ "font-size": ".8em" });
		$(".homepage-info").css({ "font-size": ".73em" });
		$("h1").css({ "margin": "9% 0% 8% 0%" });
		$("h4").css({ "margin": "9% 0% 20% 0%" });
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