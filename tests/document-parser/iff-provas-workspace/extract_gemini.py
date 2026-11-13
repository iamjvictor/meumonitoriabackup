import pdfplumber
import re
import json
import os

pdf_path = 'Arquivo Provas Antigas - primeiras 30 páginas.pdf'
os.makedirs('imagens', exist_ok=True)

official_key = {
    1: 'D', 2: 'B', 3: 'B', 4: 'C', 5: 'D', 6: 'A', 7: 'E', 8: 'B', 9: 'D', 10: 'D',
    11: 'D', 12: 'E', 13: 'C', 14: 'B', 15: 'C', 16: 'B', 17: 'A', 18: 'D', 19: 'E', 20: 'C',
    21: 'D', 22: 'B', 23: 'A', 24: 'C', 25: 'B', 26: 'E', 27: 'C', 28: 'D', 29: 'C', 30: 'A',
    31: 'B', 32: 'C', 33: 'E', 34: 'D', 35: 'E', 36: 'E', 37: 'B', 38: 'C', 39: 'C', 40: 'D'
}

disciplinas = {}
for q in range(1, 11): disciplinas[q] = 'Língua Portuguesa'
for q in range(11, 19): disciplinas[q] = 'Matemática'
for q in range(19, 31): disciplinas[q] = 'Física, Química e Biologia'
for q in range(31, 41): disciplinas[q] = 'Geografia e História'

images_map = {
    4: ['imagens/questao_04.png'],
    7: ['imagens/questao_07.png'],
    10: ['imagens/questao_10.png'],
    13: ['imagens/questao_13_figura.png'],
    14: ['imagens/questao_14_tabela.png'],
    16: ['imagens/questao_16.png'],
    17: ['imagens/questao_17.png'],
    18: ['imagens/questao_18.png'],
    21: ['imagens/questao_21.png'],
    30: ['imagens/questao_30.png'],
    31: ['imagens/questao_31.png'],
    35: ['imagens/questao_35.png'],
}

def clean_page_lines(lines):
    filtered = []
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if s in ('Pro-Reitoria de Ensino', 'Pró-Reitoria de Ensino'):
            continue
        if 'INSTITUTO FEDERAL FLUMINENSE' in s or 'SELEÇÃO 2010' in s:
            continue
        filtered.append(line)
    return filtered

with pdfplumber.open(pdf_path) as pdf:
    # Pages 3 to 27 (index 2 to 26)
    all_pages = []
    for p_idx in range(2, 27):
        page = pdf.pages[p_idx]
        lines = (page.extract_text() or '').split('\n')
        clean_lines = clean_page_lines(lines)
        all_pages.append((p_idx + 1, clean_lines))

# Join all lines while recording page markers
doc_lines = []
for p_num, lines in all_pages:
    doc_lines.extend(lines)

full_text = '\n'.join(doc_lines)

# Split by QUESTÃO N
matches = list(re.finditer(r'(?:^|\n)(QUESTÃO\s+(\d+))', full_text))
print(f'Total question markers found: {len(matches)}')

# Notice: introductory text on page 3 belongs before QUESTÃO 1
intro_text = full_text[:matches[0].start()].strip()

questions_data = []

for i, m in enumerate(matches):
    q_num = int(m.group(2))
    start_idx = m.end() # text right after QUESTÃO X
    end_idx = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
    raw_block = full_text[start_idx:end_idx].strip()
    
    # Split into statement and alternatives
    # Alternatives are marked by a), b), c), d), e)
    alt_matches = list(re.finditer(r'(?:^|\n)\s*([a-e])\)\s*', raw_block))
    
    if len(alt_matches) == 5:
        statement = raw_block[:alt_matches[0].start()].strip()
        alternatives = {}
        labels = ['a', 'b', 'c', 'd', 'e']
        for alt_idx in range(5):
            lbl = labels[alt_idx]
            alt_start = alt_matches[alt_idx].end()
            alt_end = alt_matches[alt_idx + 1].start() if alt_idx + 1 < 5 else len(raw_block)
            alt_text = raw_block[alt_start:alt_end].strip()
            # Normalize internal newlines
            alt_text = ' '.join(alt_text.split())
            alternatives[lbl] = alt_text
    else:
        # Fallback or special layout handling
        print(f'Warning: Q{q_num} has {len(alt_matches)} alternatives')
        statement = raw_block
        alternatives = {}
    
    # Normalize statement whitespace while preserving paragraph breaks
    paragraphs = [p.strip() for p in statement.split('\n\n') if p.strip()]
    clean_statement = '\n\n'.join([' '.join(p.split()) for p in paragraphs])
    
    # Associate text support if applicable
    texto_apoio = None
    if q_num in (1, 2, 3):
        texto_apoio = intro_text
    
    q_obj = {
        'numero': q_num,
        'ano': 2010,
        'instituicao': 'Instituto Federal Fluminense (IFF)',
        'processoSeletivo': 'Processo Seletivo 2010 - Ensino Médio / Técnico Concomitante / Integrado PROEJA',
        'disciplina': disciplinas[q_num],
        'enunciado': clean_statement,
        'textoApoio': texto_apoio,
        'imagens': images_map.get(q_num, []),
        'alternativas': alternatives,
        'gabarito': official_key[q_num]
    }
    questions_data.append(q_obj)

# Output json
output_file = 'extracaogemini.json'
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump({
        'ano': 2010,
        'instituicao': 'Instituto Federal Fluminense (IFF)',
        'edital': 'Edital Nº 14 de 21 de setembro de 2009',
        'processoSeletivo': 'Processo Seletivo 2010',
        'totalQuestoes': len(questions_data),
        'questoes': questions_data
    }, f, ensure_ascii=False, indent=2)

print(f'Successfully generated {output_file} with {len(questions_data)} questions.')
