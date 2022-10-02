var titleSection =
	`
<div class="title-and-developer">
	<h1 class="page-title"></h1>
	<h4 class="developed-by-text">Page Written &#38; Coded by:</h4>
	<p class="page-developer"><a href="#footer-placeholder">Alejandro Rosales</a></p>
</div>

<div class="page-properties">
<div class="dark-mode-toggle-div">
		<button id="dark-mode-toggle-btn" onclick="toggleDarkMode()">
			<i class="fas fa-moon"></i>
			<p class="dark-mode-toggle-txt">Click for Dark Mode</p>
		</button>
	</div>
	<div class="dot-div">
		<span class="dot"></span>
		<p class="dot-txt">Still Adding To This</p>
	</div>
</div>
`

var tableOfContentsCollapsible =
	`
<div class="collapsible-contents-button">
		<div class="panel-group">
			<div class="panel panel-default">
				<div class="panel-collapse collapse" id="collapse">
					<div class="collapsible-contents-top">
		 				<li><a id="top-of-page-li" href="#nav-placeholder">Top of the Page</a></li>
			 			<button id="dark-mode-toggle-btn" onclick="toggleDarkMode()"><i class="fas fa-moon"></i></button>
					</div>

	 				<br>

					<div class="table-of-contents-collapsible"></div>

					<br>

					<li><a href="#footer-placeholder">Bottom of the Page</a></li>
				</div>
				<button class="btn btn-primary contents-button" type="button" data-toggle="collapse" data-target="#collapse"
					aria-expanded="false" aria-controls="collapseExample" id="contents-button">
					<i class="far fa-list-alt" id="table-of-contents-icon"></i>
				</button>
			</div>
		</div>
	</div>
`

var navbar =
	`
<nav class="navbar navbar-expand-lg navbar-custom">
	<a class="nav-bar-brand" href="/index.html">> context<br>switching</a>
	<!-- <a class="nav-bar-creator" href="#"><br>by Alejandro Rosales</a> -->
	<button class="navbar-toggler custom-toggler" type="button" data-toggle="collapse" data-target="#navbarColor01"
		aria-controls="navbarColor01" aria-expanded="false" aria-label="Toggle navigation">
		<!-- <i class="fas fa-atom"></i> -->
		<!-- <i class="fab fa-cloudsmith"></i> -->
		<i class="fab fa-connectdevelop"></i>
		<!-- <span class="fab fa-connectdevelop"></span> -->
	</button>
	<div class="collapse navbar-collapse" id="navbarColor01">
		<ul class="navbar-nav mr-auto">
			<!-- <li class="nav-item active">
        <a class="nav-link" href="../index.html">Home<span class="sr-only">(current)</span></a>
      </li> -->
			<li class="nav-item dropdown">
				<a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true"
					aria-expanded="false">
					Theoretical Computer Science
				</a>
				<div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
					<a class="dropdown-item" href="/tcs/algorithmicanalysis.html">Algorithmic Analysis</a>
					<a class="dropdown-item" href="/tcs/theoryofcomputation.html">Theory of Computation</a>
					<a class="dropdown-item" href="/tcs/graphtheory.html">Graph Theory</a>
					<hr>
					<p class="dropdown-item coming-soon-text">Topics to Come!</p>
					<a class="dropdown-item todo" href="/tcs/combinatorialoptimization.html">Combinatorial Optimization</a>
					<a class="dropdown-item todo" href="/tcs/pandnp.html">P & NP</a>
					<a class="dropdown-item todo" href="/todo.html">SAT & 3-SAT</a>
					<a class="dropdown-item todo" href="/todo.html">NP Reductions</a>
					<a class="dropdown-item todo" href="/todo.html">Approximate Algorithms</a>
					<a class="dropdown-item todo" href="/tcs/randomizationalgorithms.html">Randomization Algorithms</a>
					<!-- <div class="dropdown-divider"></div>
          <a class="dropdown-item" href="#">Something else here</a> -->
				</div>
			</li>
			<li class="nav-item dropdown">
				<a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true"
					aria-expanded="false">
					Mathematics
				</a>
				<div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
					<a class="dropdown-item" href="/math/differential-manifolds.html">Differential Manifolds</a>
				</div>
			</li>
			<li class="nav-item dropdown">
				<a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true"
					aria-expanded="false">
					Neuroscience
				</a>
				<div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
					<a class="dropdown-item" href="/neuroscience/neuralnetworks.html">Artificial vs Biological Neural
						Networks</a>
					<a class="dropdown-item" href="/neuroscience/howwelearn.html">How We Learn</a>
					<hr>
					<p class="dropdown-item coming-soon-text">Topics To Come!</p>
					<a class="dropdown-item todo" href="/todo.html">Neurobiological bases of memory formation</a>
				</div>
			</li>
			<!-- <li class="nav-item dropdown">
        <a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
          Economics
        </a>
        <div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
          <a class="dropdown-item" href="/todo.html">Ten Principles of Economics</a>
        </div>
      </li> -->
			<li class="nav-item dropdown">
				<a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true"
					aria-expanded="false">
					Statistics
				</a>
				<div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
					<p class="dropdown-item coming-soon-text">Topics To Come!</p>
					<a class="dropdown-item todo" href="/todo.html">Pearson Correlation</a>
					<a class="dropdown-item todo" href="/todo.html">LOESS Nonparametric Regression</a>
					<a class="dropdown-item todo" href="/todo.html">Regression and Classification Trees</a>
					<a class="dropdown-item todo" href="/todo.html">ANOVA</a>
					<a class="dropdown-item todo" href="/todo.html">T-test</a>
				</div>
			</li>
			<li class="nav-item">
				<a class="nav-link" target="_blank" rel="noopener noreferrer" href="https://github.com/AlejandroJRosales">My Other Projects&nbsp;<i
						class="fas fa-external-link-alt" id="external-link-icon"></i></a>
			</li>
			<br>
		</ul>

		<form class="form-inline">
			<div class="btn btn-outline-light nav-search-div">
				<div class="nav-search-glyph">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-search"
						viewBox="0 0 16 16">
						<path
							d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z">
						</path>
					</svg>
				</div>
				<div class="nav-search-box-div" onclick="openSearch()">
					<input id="nav-search-box" placeholder="Find Term Everywhere"></input>
				</div>
			</div>
		</form>
		<br>
	</div>
</nav>
`

var footer =
	`
<link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.13.0/css/all.css">

<!-- Footer -->
<footer class="page-footer font-small" class="footer">
	<!-- Footer Links -->
	<div class="container">
		<!-- Grid row-->
		<div class="footer-links row text-center d-flex justify-content-center pt-5 mb-3">
			<!-- Grid column -->
			<div class="col-md-2 mb-3">
				<p>
					<a target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/in/alejandro-rosales-36ab16191/">LinkedIn</a>
				</p>
			</div>
			<!-- Grid column -->

			<!-- Grid column -->
			<div class="col-md-3 mb-3">
				<p>
					<a href="/index.html#about-me">About Me</a>
				</p>
			</div>
			<!-- Grid column -->

			<!-- Grid column -->
			<div class="col-md-2 mb-3">
				<p>
					<a target="_blank" rel="noopener noreferrer" href="https://github.com/AlejandroJRosales">My Other Projects</a>
				</p>
			</div>
			<!-- Grid column -->
		</div>
		<!-- Grid row-->

		<hr class="rgba-white-light" style="margin: 0 15%;">

		<!-- Grid row-->
		<div class="row d-flex text-center justify-content-center mb-md-0 mb-4">
			<!-- Grid column -->
			<div class="col-md-8 col-12 mt-5">
				<div class="footer-about-me">
					<h3 id="footer-about-me-title">Welcome!</h3>
					<p style="line-height: 1.7rem">Welcome to my website! I coded it myself. It's not much but its honest work. My
						name is Alejandro Rosales and I love teaching in depth about whatever new topic is that I am learning about.
						This website provides me a space to do that! I hope you enjoy my website and whatever I am teaching!
					</p>
				</div>
			</div>
			<!-- Grid column -->
		</div>
	</div>
</footer>
<!-- Footer -->
`