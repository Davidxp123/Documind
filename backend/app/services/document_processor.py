import os
import fitz  # PyMuPDF
import docx
import pandas as pd
import pytesseract
from PIL import Image
from pptx import Presentation
from bs4 import BeautifulSoup
from langchain_text_splitters import RecursiveCharacterTextSplitter

class DocumentProcessor:
    @staticmethod
    def extract_text_and_chunks(file_path: str, file_type: str):
        pages_content = []
        
        ext = file_type.lower()
        if ext in ["pdf"]:
            doc = fitz.open(file_path)
            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text()
                # OCR Fallback if text extraction is minimal
                if len(text.strip()) < 30:
                    pix = page.get_pixmap()
                    img_path = f"{file_path}_p{page_num}.png"
                    pix.save(img_path)
                    ocr_text = pytesseract.image_to_string(Image.open(img_path))
                    if os.path.exists(img_path):
                        os.remove(img_path)
                    text = ocr_text if len(ocr_text) > len(text) else text
                pages_content.append({"page": page_num + 1, "text": text})
                
        elif ext in ["docx"]:
            doc = docx.Document(file_path)
            full_text = "\n".join([p.text for p in doc.paragraphs if p.text])
            pages_content.append({"page": 1, "text": full_text})
            
        elif ext in ["xlsx", "csv", "xls"]:
            if ext == "csv":
                df = pd.read_csv(file_path)
                pages_content.append({"page": 1, "text": df.to_markdown()})
            else:
                # Use openpyxl for xlsx, default engine might fail for some files
                xl = pd.ExcelFile(file_path)
                for sheet_name in xl.sheet_names:
                    df = xl.parse(sheet_name)
                    pages_content.append({"page": 1, "text": f"Sheet: {sheet_name}\n{df.to_markdown()}"})
            
        elif ext in ["png", "jpg", "jpeg"]:
            text = pytesseract.image_to_string(Image.open(file_path))
            pages_content.append({"page": 1, "text": text})
            
        elif ext in ["pptx"]:
            prs = Presentation(file_path)
            for idx, slide in enumerate(prs.slides):
                slide_text_set = set()
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text.strip():
                        slide_text_set.add(shape.text.strip())
                pages_content.append({"page": idx + 1, "text": "\n".join(slide_text_set)})
                
        elif ext in ["html", "htm"]:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                soup = BeautifulSoup(f.read(), "html.parser")
                pages_content.append({"page": 1, "text": soup.get_text()})
                
        else: # txt, md, json
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                pages_content.append({"page": 1, "text": f.read()})

        # Semantic Chunking
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = []
        for page_obj in pages_content:
            page_chunks = splitter.split_text(page_obj["text"])
            for idx, chunk in enumerate(page_chunks):
                chunks.append({
                    "text": chunk,
                    "page": page_obj["page"],
                    "chunk_idx": idx
                })
                
        return pages_content, chunks
