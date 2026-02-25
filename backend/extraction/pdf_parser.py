from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

import cv2
import fitz  # PyMuPDF
import numpy as np
import pdfplumber
import pytesseract

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


@dataclass
class PageResult:
    page_num: int
    text: str
    tables: List[Dict[str, Any]]


class PDFParser:
    def __init__(self, ocr_lang: str = "eng") -> None:
        self.ocr_lang = ocr_lang

    def parse(self, file_path: str) -> Dict[str, Any]:
        pages: List[PageResult] = []

        with fitz.open(file_path) as doc:
            page_count = len(doc)
            if page_count == 0:
                return {
                    "full_text": "",
                    "pages": [],
                    "is_scanned": False,
                    "page_count": 0,
                    "extraction_method": "digital",
                }

            with pdfplumber.open(file_path) as plumber_doc:
                for page_index in range(page_count):
                    fitz_page = doc[page_index]
                    text = fitz_page.get_text("text") or ""

                    tables: List[Dict[str, Any]] = []
                    plumber_page = plumber_doc.pages[page_index]
                    table_objs = plumber_page.extract_tables() or []

                    for table in table_objs:
                        if len(table) > 3:
                            headers = table[0]
                            for row in table[1:]:
                                row_dict = {
                                    str(headers[i]) if i < len(headers) else f"col_{i}": row[i]
                                    for i in range(len(row))
                                }
                                tables.append(row_dict)

                    pages.append(
                        PageResult(
                            page_num=page_index + 1,
                            text=text,
                            tables=tables,
                        )
                    )

        total_chars = sum(len(p.text) for p in pages)
        avg_chars_per_page = total_chars / len(pages) if pages else 0
        is_scanned = avg_chars_per_page < 100

        if is_scanned:
            pages = self._run_ocr_pipeline(file_path)

        full_text = "\n\n".join(p.text for p in pages)

        return {
            "full_text": full_text,
            "pages": [
                {
                    "page_num": p.page_num,
                    "text": p.text,
                    "tables": p.tables,
                }
                for p in pages
            ],
            "is_scanned": is_scanned,
            "page_count": len(pages),
            "extraction_method": "ocr" if is_scanned else "digital",
        }

    def _run_ocr_pipeline(self, file_path: str) -> List[PageResult]:
        pages: List[PageResult] = []

        with fitz.open(file_path) as doc:
            with pdfplumber.open(file_path) as plumber_doc:
                for page_index in range(len(doc)):
                    fitz_page = doc[page_index]
                    pix = fitz_page.get_pixmap(dpi=300)
                    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                        pix.height, pix.width, pix.n
                    )
                    if pix.n == 4:
                        img = cv2.cvtColor(img, cv2.COLOR_RGBA2RGB)

                    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
                    _, thresh = cv2.threshold(
                        gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
                    )

                    deskewed = self._deskew(thresh)

                    ocr_text = pytesseract.image_to_string(
                        deskewed,
                        lang=self.ocr_lang,
                        config="--oem 3 --psm 6",
                    )

                    tables: List[Dict[str, Any]] = []
                    plumber_page = plumber_doc.pages[page_index]
                    table_objs = plumber_page.extract_tables() or []
                    for table in table_objs:
                        if len(table) > 3:
                            headers = table[0]
                            for row in table[1:]:
                                row_dict = {
                                    str(headers[i]) if i < len(headers) else f"col_{i}": row[i]
                                    for i in range(len(row))
                                }
                                tables.append(row_dict)

                    pages.append(
                        PageResult(
                            page_num=page_index + 1,
                            text=ocr_text,
                            tables=tables,
                        )
                    )

        return pages

    @staticmethod
    def _deskew(image: np.ndarray) -> np.ndarray:
        coords = np.column_stack(np.where(image < 255))
        if coords.size == 0:
            return image

        rect = cv2.minAreaRect(coords)
        angle = rect[-1]

        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle

        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(
            image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
        )
        return rotated

