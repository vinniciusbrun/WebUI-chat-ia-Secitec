import re

def format_latex(text):
    """Format LaTeX expressions for proper rendering with MathJax"""
    if not text or ('[' not in text and '$' not in text):
        return text

    # Handle block equations with [...]
    text = re.sub(r'\[\s*\n*(.+?)\n*\s*\]', 
                  lambda m: f'<div class="equation-block">\\[{m.group(1).strip()}\\]</div>', 
                  text, 
                  flags=re.DOTALL)
    
    # Handle display equations with $$...$$
    text = re.sub(r'\$\$(.+?)\$\$', 
                  lambda m: f'<div class="math-block">$${m.group(1).strip()}$$</div>', 
                  text, 
                  flags=re.DOTALL)
    
    # Handle inline equations with single $...$
    text = re.sub(r'(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)', 
                  lambda m: f'<span class="math-inline">${m.group(1).strip()}$</span>', 
                  text)
    
    # Handle numbered equations
    text = re.sub(r'(\d+)\.\s*\[\s*\n*(.+?)\n*\s*\]', 
                  lambda m: f'<div class="equation-block"><span class="equation-number">{m.group(1)}.</span>\\[{m.group(2).strip()}\\]</div>', 
                  text, 
                  flags=re.DOTALL)

    return text

def is_latex_content(text):
    """Check if text contains LaTeX expressions"""
    latex_patterns = [r'\[.*?\]', r'\$.*?\$', r'\\begin\{.*?\}']
    return any(re.search(pattern, text, re.DOTALL) for pattern in latex_patterns)