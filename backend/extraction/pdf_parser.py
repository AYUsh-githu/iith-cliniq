from typing import Iterable

import fitz  # PyMuPDF


def extract_text_from_pdf(path: str) -> str:
    doc = fitz.open(path)
    texts: list[str] = []
    for page in doc:
        texts.append(page.get_text())
    doc.close()
    return "\n".join(texts)

