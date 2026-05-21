import os
from bs4 import BeautifulSoup

def analyze_file(filename):
    if not os.path.exists(filename):
        print(f"File {filename} not found.")
        return
    
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    substrings = ['review-panel-entry-comment', 'review-panel-comment-body', 'data-pos=', 'cm-content', 'lorem', 'ipsum']
    sub_counts = {s: content.count(s) for s in substrings}
    
    soup_html = BeautifulSoup(content, 'html.parser')
    soup_lxml = BeautifulSoup(content, 'lxml')
    
    bs_counts = {
        'html.parser_entry': len(soup_html.find_all(class_='review-panel-entry-comment')),
        'html.parser_body': len(soup_html.find_all(class_='review-panel-comment-body')),
        'lxml_entry': len(soup_lxml.find_all(class_='review-panel-entry-comment')),
        'lxml_body': len(soup_lxml.find_all(class_='review-panel-comment-body'))
    }
    
    print(f"\nAnalysis for: {filename}")
    print(f"{'Substring':<30} | {'Count':<5}")
    print("-" * 40)
    for s, count in sub_counts.items():
        print(f"{s:<30} | {count:<5}")
    
    print(f"\nBS4 Counts for: {filename}")
    print(f"{'Parser_Class':<30} | {'Count':<5}")
    print("-" * 40)
    for k, v in bs_counts.items():
        print(f"{k:<30} | {v:<5}")

analyze_file('mwe - Online LaTeX Editor Overleaf.html')
analyze_file('untitled.html')
