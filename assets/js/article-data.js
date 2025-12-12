var $table = $('#table')

$(function() {
    var data = [
      {
        'id': 0,
        'name': 'Epigenetics and Inheritance',
        'preview': 'In biology, epigenetics is the study of mitotically and/or meiotically heritable changes in gene function that cannot be explained by changes to the DNA sequence. Epigenetics normally involves change that is not erased by cell division and that also affects the regulation of gene expression. Epigenetics reflects our understanding',
        'url': '/misc/epigeneticsandinheritance',
      },
      {
        'id': 1,
        'name': 'High-Dimensional Quantum Feature Mapping',
        'preview': `Quantum Principal Component Analysis identifies large eigenvalues of unknown density matrices utilizing corresponding eigenvectors in \(O(\log d)\). Where principal component analysis analyzes positive semi-definite Hermitian matrices by decomposing eigenvectors in relation to the largest eigenvalues in the matrix for dimensionality reduction. Improved computational complexity will hopefully allow new methods for`,
        'url': '/cs/highdimquantumfm'
      },
      {
        'id': 2,
        'name': 'Quantum Fields in Anti-de Sitter Space and the Maldacena Conjecture',
        'preview': `In theoretical physics, the Maldacena Conjecture states supergravity and string theory on the
        product of \((n+1)\)-dimensional Anti-de Sitter space with a compact manifold is capable of describing large \(N\)
        limits of conformal field theories in \(d\)-dimensions. Correlation functions in CFT are dependent on the
        supergravity action of asymptotic behavior at`,
        'url': '/misc/qfandadsmaldacenaconjecture'
      },
    ]
    $table.bootstrapTable({data: data})
})

function mapArticleData() {
    data = getArticleData();
}

function getArticleData() {
    
}

function getPreview() {

}