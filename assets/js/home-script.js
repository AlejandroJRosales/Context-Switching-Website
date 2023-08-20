var isMobile = getIsMobile();
var toggleModeMrgTxtLight;
var toggleModeMrgTxtDark;
var toggleModeDirIcon;
var toggleModeMrgIcon;
var collapseContentsIsHidden = false;
var userHasScrolled = false;
var titleRevealed = false;
var delayInMilliseconds = 500; //1 second
var sectionHeaders = ["category-header", "section-header", "subsection-header", "subsubsection-header", "subsubsubsection-header"];


window.MathJax = {
	loader: {
		load: ['[tex]/braket']
	},
	tex: {
		inlineMath: [['$', '$'], ['\\(', '\\)']],
		packages: { '[+]': ['braket'] }
	},
	svg: {
		fontCache: 'global'
	}
};

$(function() {
	addDynamicHTML();
	applyDynamicStyle();
});

function addDynamicHTML() {
	$(".nav-placeholder").html(navbar);
	$(".footer-placeholder").html(footer);
}

function applyDynamicStyle() {
	$(".page-title").text($(".category-header").text());
	if (isMobile) {
		$(".fa-moon").css({ "margin-top": ".5em" });
		$(".fa-sun").css({ "margin-top": ".5em" });
		$(".code").css({ "font-size": "75%", "margin": "10% 3% 10% 3%" });
		$(".website-title").css({ "font-size": "1.5em", "margin-bottom": ".75em" });
		$(".website-creator-by").css({ "font-size": ".92em", "margin-bottom": "1em" });
		$(".website-creator").css({ "font-size": ".92em" });
		$(".homepage-info").css({ "font-size": ".73em" });
		$(".page-title").css({ "padding": "0% 10% 5% 10%" });
		$(".information").css({ "margin": "0% 10% 10% 10%" });
		$(".figure").css({ "margin-top": "10%", "margin-bottom": "10%", "width": "90%" });
		$(".nav-search-div").css({ "min-width": "225px" });
		$("#nav-search-box").css({ "min-width": "200px" });
		$(".img-avatar").css({ "height": "48%", "width": "48%" });
		$(".avatar-page-developer").css({ "font-size": "1.3em", "padding-top": "7%" });
	}
}

$(function() {
	$(".sliding-link").click(function(e) {
		e.preventDefault();
		// console.log($(this).attr("href"));
		var aid = $(this).attr("href");
		$('html,body').animate({ scrollTop: $(aid).offset().top }, 'fast');
	});
});

window.addEventListener("scroll", reveal);
window.addEventListener("scroll", revealButton);
// window.addEventListener("scroll", revealTitle);

window.addEventListener('click', function(e) {
	// nav searh bar
	var isSearchBar = document.getElementById('nav-search-box').contains(e.target);

	if (isSearchBar) {
		$(".nav-search-div").css({ "background-color": "white" });
		$(".nav-search-glyph").css({ "color": "black" });
	}
});

function reveal() {
	userHasScrolled = true;
	var reveals = document.querySelectorAll(".reveal");

	for (var i = 0; i < reveals.length; i++) {
		var windowHeight = window.innerHeight;
		var elementTop = reveals[i].getBoundingClientRect().top;
		var elementVisible = 10;

		if (elementTop < windowHeight - elementVisible) {
			reveals[i].classList.add("active");
		} else {
			reveals[i].classList.remove("active");
		}
	}
}

function showIt(elementId) {
	var el = document.getElementById(elementId);
	el.scrollIntoView(true);
}

function toggleDarkMode() {
	if ($("body").css("background").indexOf("rgb(255, 255, 255)") == 0) {
		$("body").css({ "background-color": "rgb(41,41,41)" });
		$(".website-intro").css({ "background-color": "rgb(41,41,41)" });
		$(".website-creator-by").css({ "color": "white" });
		$(".fa-moon").addClass("fa-sun").removeClass("fa-moon");
		$(".fa-sun").css({ "color": "white" });
		$("#dark-mode-toggle-btn").css({ "color": "white" });
		$(".figure").css({ "-webkit-filter": "invert(1)", "filter": "invert(1)" });
		$(".mini-banner").css({ "background": "rgb(41,41,41)", "color": "white" });
		$(".mini-banner-label").css({ "color": "white" });
		$(".website-title").css({ "color": "white" });
		$(".home-text-box").css({ "background-color": "rgb(41,41,41)" });
		$(".homepage-info").css({ "background-color": "rgb(41,41,41)", "color": "white" });
	}
	else {
		$("body").css({ "background-color": "rgb(255, 255, 255)" });
		$(".website-intro").css({ "background-color": "rgb(255, 255, 255)" });
		$(".website-creator-by").css({ "color": "black" });
		$(".fa-sun").addClass("fa-moon").removeClass("fa-sun");
		$(".fa-moon").css({ "color": "black" });
		$("#dark-mode-toggle-btn").css({ "color": "black" });
		$(".figure").css({ "-webkit-filter": "invert(0)", "filter": "invert(0)" });
		$(".mini-banner").css({ "background": "white", "color": "black" });
		$(".mini-banner-label").css({ "color": "black" });
		$(".website-title").css({ "color": "black" });
		$(".home-text-box").css({ "background-color": "white" });
		$(".homepage-info").css({ "background-color": "white", "color": "black" });
	}
}