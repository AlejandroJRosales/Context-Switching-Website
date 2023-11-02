var titleSection =
	`
	<div class="title-and-developer">
		<h1 class="page-title"></h1>
		<div class="other-contents-page-title reveal-title fade-in"> 
			<div class="page-header">
				<h4 class="developed-by-text">Written &#38; Coded by:</h4>
				<p class="page-developer" id="developer-title"><a href="/assets/utils/aboutme.html">Alejandro Rosales</a></p>
		 	</div>
		</div>
	</div>
`

var temp =
	`

<div class="dark-mode-toggle-div">
					<button id="dark-mode-toggle-btn" onclick="toggleDarkMode()">
						<i class="fas fa-moon"></i>
					</button>
				</div>
 
			<div class="page-properties">
				<div class="dark-mode-toggle-div">
						<button id="dark-mode-toggle-btn" onclick="toggleDarkMode()">
							<i class="fas fa-moon"></i>
							<p class="dark-mode-toggle-txt">Click for Dark Mode</p>
						</button>
					</div>
					<div class="dot-div">
						<!-- <span class="dot"></span> -->
						<p class="dot-txt"><i>Still Editing Page</i></p>
					</div>
		 			<!-- <button class="focus-mode-btn"  id="enter-focus-mode-btn" onclick="focusMode()""><p>[Enter Focus Mode]</p></button> -->
				</div>
			</div>
		</div>
	</div>
`

var tableOfContentsCollapsible =
	`
<div class="contents-button-container">
	<div class="collapsible-contents-button reveal-button fade-in">
 			<!-- <h4 class=reveal fade-right">Section<br>Links</h4> -->
			<div class="panel-group">
				<div class="panel panel-default">
					<div class="panel-collapse collapse" id="collapse">
	
						<div class="table-of-contents-collapsible"></div>
	
						<! -- TODO: add below br and li to new var collapsePageBottomink -->
						<br>
	
						<li><a class="sliding-link" id="contents-link" href="#footer-placeholder">Bottom of the Page</a></li>
					</div>
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
	<a class="nav-bar-brand" href="/index.html">Context<br>Switching</a>
	<!-- <a class="nav-bar-creator" href="#"><br>by Alejandro Rosales</a> -->
	<button class="navbar-toggler custom-toggler" type="button" data-toggle="collapse" data-target="#navbarColor01"
		aria-controls="navbarColor01" aria-expanded="false" aria-label="Toggle navigation">
		<!-- <i class="fas fa-atom"></i> -->
		<!-- <i class="fab fa-cloudsmith"></i> -->
		<!-- <i class="fab fa-connectdevelop"></i> -->
		<!-- <span class="fab fa-connectdevelop"></span> -->
		<!-- <i class="fas fa-ellipsis-v"></i> -->
		<i class="fas fa-bars"></i>
	</button>
	<div class="collapse navbar-collapse" id="navbarColor01">
		<ul class="navbar-nav mr-auto">
			
			<li class="nav-item dropdown">
				<a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true"
					aria-expanded="false">
					Theoretical Computer Science
				</a>
				<div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
					<a class="dropdown-item" href="/tcs/quantumcomputingtheory.html">Quantum Computing Theory</a>
					<a class="dropdown-item" href="/tcs/informationtheory.html">Information Theory</a>
					<a class="dropdown-item" href="/tcs/quantummachinelearning.html">Quantum Machine Learning</a>
		 			<a class="dropdown-item" href="/tcs/graphtheory.html">Graph Theory</a>
		 			<a class="dropdown-item" href="/tcs/theoryofcomputation.html">Theory of Computation</a>
					<a class="dropdown-item" href="/tcs/algorithmicanalysis.html">Algorithmic Analysis</a>
					<hr>
					<p class="dropdown-item coming-soon-text">Topics to Come!</p>
					<a class="dropdown-item todo" href="/todo.html">Combinatorial and Stochastic Optimization</a>
					<!-- <a class="dropdown-item todo" href="/todo.html">Quantum Networks</a> -->
					<a class="dropdown-item todo" href="/todo.html">Combinatorics and Graph Theory</a>
					<!-- <a class="dropdown-item todo" href="/todo.html">P vs NP</a> -->
					<a class="dropdown-item todo" href="/todo.html">Approximation Algorithms</a>
					<a class="dropdown-item todo" href="/todo.html">Randomization Algorithms</a>
		 			<a class="dropdown-item todo" href="/todo.html">Pseudorandomness</a>
					<a class="dropdown-item todo" href="/todo.html">Algorithmic Game Theory</a>
			</li>
	 
			<li class="nav-item dropdown">
				<a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true"
					aria-expanded="false">
					Mathematics
				</a>
				<div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
					<a class="dropdown-item" href="/math/differentialmanifolds.html">Differential Manifolds</a>
					<a class="dropdown-item" href="/math/chernclass.html">Chern Class</a>
					<a class="dropdown-item" href="/math/quantummechanics.html">Quantum Mechanics</a>
					<a class="dropdown-item" href="/math/hiddenmarkovprocesses.html">Hidden Markov Processes</a>
					<a class="dropdown-item" href="/math/abstractalgebra.html">Abstract Algebra</a>
		 			<a class="dropdown-item" href="/tcs/graphtheory.html">Graph Theory</a>
		 			<hr>
					<p class="dropdown-item coming-soon-text">Topics To Come!</p>
					<a class="dropdown-item todo" href="/todo.html">Approximation Functions</a>
				</div>
			</li>
	 
			<li class="nav-item dropdown">
				<a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true"
					aria-expanded="false">
					Neuroscience
				</a>
				<div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
					<a class="dropdown-item" href="/neuroscience/memoryformation.html">Neurobiological Bases of<br> Memory Formation</a>
		 			<a class="dropdown-item" href="/neuroscience/topologicalneuroscience.html">Topological Neuroscience</a>
					<a class="dropdown-item" href="/neuroscience/connectionsinhumanstructuralconnectome.html">Connections in the<br>Human Structural
				Connectome</a>
					<a class="dropdown-item" href="/neuroscience/hippocampusanoverview.html">Hippocampus: An Overview</a>
					<hr>
					<p class="dropdown-item coming-soon-text">Topics To Come!</p>
		 			<a class="dropdown-item todo" href="/todo.html">Neocortex</a>
					<a class="dropdown-item todo" href="/todo.html">Computational Neuroscience</a>
		 			<a class="dropdown-item todo" href="/todo.html">Cerebral Cortex</a>
				</div>
			</li>

			<li class="nav-item dropdown">
				<a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true"
					aria-expanded="false">
					My Links
				</a>
				<div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
					<a class="dropdown-item" target="_blank" rel="noopener noreferrer" href="https://github.com/AlejandroJRosales">Programming Projects</a>
					<a class="dropdown-item" target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/in/alejandro-rosales-36ab16191/">LinkedIn</a>
					<a class="dropdown-item" target="_blank" rel="noopener noreferrer" href="https://oneai.cloud/">Artifically Intelligent Assistant</a>
					<a class="dropdown-item" href="/assets/utils/aboutme.html">About Me</a>
				</div>
			</li>
		</ul>

		<form class="form-inline navbar-search">
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
					<input id="nav-search-box" placeholder="Search Website"></input>
				</div>
			</div>
		</form>
		<br>
	</div>
</nav>

<div class="navbar-item dark-mode-toggle-div">
	<button id="dark-mode-toggle-btn" onclick="toggleDarkMode()">
		<i class="fas fa-moon fa-2xl"></i>
	</button>
</div>
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
			<div class="col-md-2 mb-3">
				<p>
					<a target="_blank" rel="noopener noreferrer" href="https://github.com/AlejandroJRosales">Projects</a>
				</p>
			</div>
			<!-- Grid column -->

	    <!-- Grid column -->
			<div class="col-md-2 mb-3">
				<p>
					<a href="/assets/utils/aboutme.html">About Me</a>
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
					<h3 id="footer-about-me-title">Welcome</h3>
		 			<br>
					<p style="line-height: 1.7rem">Welcome to my website! My
						name is Alejandro Rosales, and I coded this website from scratch. It's not much, but it's honest work. 
						My website provides a space for me to talk in-depth and teach about the newest topic I'm learning about! 
						I hope you enjoy!
					</p>

	 <hr class="rgba-white-light" style="margin: 0 15%;">

					<br>

	 				<p style="line-height: 1.7rem">Contact me at:<br>alejand.j.rosales@gmail.com
					</p>
				</div>
			</div>
			<!-- Grid column -->
		</div>
	</div>
</footer>
<!-- Footer -->
`