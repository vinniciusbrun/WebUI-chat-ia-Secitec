function renderMath() {
    const content = document.querySelector('.chat-content');
    if (!content) return;

    const walker = document.createTreeWalker(
        content,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    const nodesToReplace = [];

    // Find all text nodes containing LaTeX delimiters
    while (node = walker.nextNode()) {
        let text = node.textContent;
        
        // Handle inline equations with single $
        if (text.includes('$')) {
            text = text.replace(/(?<!\$)\$(?!\$)(.*?)(?<!\$)\$(?!\$)/g, (match, latex) => {
                return `<span class="math-inline" data-latex="${encodeURIComponent(latex.trim())}">${match}</span>`;
            });
            
            // Handle display equations with $$
            text = text.replace(/\$\$(.*?)\$\$/gs, (match, latex) => {
                return `<div class="math-block" data-latex="${encodeURIComponent(latex.trim())}">${match}</div>`;
            });

            nodesToReplace.push({
                oldNode: node,
                newContent: text
            });
        }
    }

    // Replace nodes and trigger MathJax rendering
    for (const {oldNode, newContent} of nodesToReplace) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newContent;
        
        const fragment = document.createDocumentFragment();
        while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
        }
        
        oldNode.parentNode.replaceChild(fragment, oldNode);
    }

    // Trigger LaTeX rendering after DOM updates
    if (typeof MathJax !== 'undefined') {
        MathJax.typeset ? MathJax.typeset() : MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
    } else if (typeof katex !== 'undefined') {
        document.querySelectorAll('.equation').forEach(el => {
            const latex = decodeURIComponent(el.getAttribute('data-latex'));
            katex.render(latex, el, {
                throwOnError: false,
                displayMode: true
            });
        });
    }
}