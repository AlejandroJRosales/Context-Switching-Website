$(function() {
	$(".nav-placeholder").load("/utils/navbar.html");
	$(".footer-placeholder").load("/utils/footer.html");
	$(".dark-mode-toggle-div").load("/utils/dark-mode-toggle.html");
});

$(function() {
	var sectionHeaders = ["category-header", "section-header", "subsection-header", "subsubsection-header"]

	var tableOfContentsStr = "<h5><i class='far fa-list-alt' id='simple-nav-table'></i> Page Section Links</h5>";
	var lastHeaderIdx = 0;
	var currHeaderIdx = 0;

	// loop through the whole DOM tree using find(*)
	$(".information").find('*').each(function(index) {
		// get the section header name from the first paragraph tag
		var currentSectionName = $(this).find("p:first").attr('class');

		// make sure the node we are looking at is a header and is not categories definer
		if (typeof currentSectionName !== "undefined" && !$(this).hasClass('categories')) {
			currHeaderIdx = sectionHeaders.indexOf(currentSectionName);

			// header order: l: Graph theory, c: simple graph
			if (currHeaderIdx > lastHeaderIdx) {
				tableOfContentsStr += '<ul><li><a href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';
				lastHeaderIdx = currHeaderIdx;
			}
			// header order: [last, current]
			else if (currHeaderIdx < lastHeaderIdx) {
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

function toggleDarkMode() {
	if ($(".information").css("background-color") == "rgb(255, 255, 255)") {
		$("body").css({ "background": "black" });
		$(".title-page").css({ "color": "white" });
		$(".information").css({ "background-color": "black", "color": "white" });
		$("#dark-mode-toggle-btn").html('<i class="fas fa-sun"></i><p class="dark-mode-toggle-txt">Tap for Light Mode</p>');
		$(".dark-mode-toggle-txt").css({ "color": "white" });
		$("#dark-mode-toggle-btn").css({ "color": "white" });
	}
	else {
		$("body").css({ "background": "white" });
		$(".title-page").css({ "color": "black" });
		$(".information").css({ "background-color": "white", "color": "black" });
		$("#dark-mode-toggle-btn").html('<i class="fas fa-moon"></i><p class="dark-mode-toggle-txt">Tap for Dark Mode</p>');
		$(".dark-mode-toggle-txt").css({ "color": "black" });
		$("#dark-mode-toggle-btn").css({ "color": "black" });
	}
}

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
		$(".nav-bar-brand").css({ "font-size": "1em" });
		$(".code").css({ "font-size": "75%", "margin": "10% 3% 10% 3%" });
		$(".collapsible-contents-button").css({ "bottom": "7%", "right": "3%" });
		$(".contents-button").css({ "margin-left": "2%" });
		$("#collapse").css({ "margin-left": "2%" });
		$(".information").css({ "margin-left": "10%", "margin-right": "10%" });
		$(".page-properties").css({ "margin-left": "5%", "margin-right": "10%" });
		$(".dot-div").css({ "padding-left": "5%", "margin-bottom": "1%" });
		$(".website-title").css({ "font-size": "1.5em" });
		$(".website-creator").css({ "font-size": ".8em" });
		$(".homepage-info").css({ "font-size": ".73em" });
		$(".title-page h1").css({ "margin": "9% 10% 8% 10%" });
		$(".title-page h4").css({ "margin": "9% 10% 20% 10%" });
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
		// console.log("clicked");
	});
});

function openSearch() {
	// document.getElementById("myOverlay").style.display = "block";
	// $("#find-button").css({ "background": "white" });
	// $("#find-button").text("");
	// $("#find-button").html("<input id='search-input'></input>");
	// $("#search-input").css({ "background": "white" });
	$(".nav-search-div").css({ "background-color": "white", "min-width": "140px" });
	// $(".nav-search-glyph").html("<p>X</p>");
	$(".nav-search-glyph").css({ "color": "black" });
	// $(".nav-search-input").html("<input placeholder='Search for a term'></input>");
	// $(".nav-search-input").css({ "border": "none" });
}

window.addEventListener('click', function(e) {
	// Clicked outside nav bar search box
	if (!document.getElementById('nav-search-box').contains(e.target)) {
		$(".nav-search-div").css({ "background-color": "transparent", "min-width": "180px" });
		$(".nav-search-glyph").css({ "color": "white" });
	}
});

// function closeSearch() {
// 	document.getElementById("myOverlay").style.display = "none";
// }