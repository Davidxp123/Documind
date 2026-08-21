import os
import fitz  # PyMuPDF
import docx
import pandas as pd
import pytesseract
from PIL import Image
from pptx import Presentation
from bs4 import BeautifulSoup
from langchain_text_splitters import RecursiveCharacterTextSplitter

def _format_dataframe(df: pd.DataFrame, max_rows: int = 150) -> str:
    """Safely format a pandas dataframe into readable markdown table and summary context."""
    try:
        if df.empty:
            return "(Empty table/sheet)"
        
        # Clean null values and format headers
        clean_df = df.fillna("")
        total_rows, total_cols = df.shape
        columns_list = [str(c).strip() for c in df.columns]
        
        summary_header = f"Table Schema & Dimensions: {total_rows} rows × {total_cols} columns\nColumns: {', '.join(columns_list)}\n"
        
        # Numerical summary for key columns if any
        num_cols = df.select_dtypes(include=['number']).columns.tolist()
        num_summary = ""
        if num_cols:
            stats = []
            for col in num_cols[:6]:
                col_series = df[col].dropna()
                if not col_series.empty:
                    stats.append(f"{col} (min: {col_series.min()}, max: {col_series.max()}, mean: {col_series.mean():.2f})")
            if stats:
                num_summary = f"Numeric Column Summaries: {'; '.join(stats)}\n\n"

        if len(clean_df) > max_rows:
            display_df = clean_df.head(max_rows)
            truncated_msg = f"\n... [Showing first {max_rows} rows of {total_rows} total rows]"
        else:
            display_df = clean_df
            truncated_msg = ""

        try:
            table_md = display_df.to_markdown(index=False)
        except Exception:
            table_md = display_df.to_string(index=False)

        return f"{summary_header}{num_summary}Data Records (Markdown Table):\n{table_md}{truncated_msg}"
    except Exception as e:
        return f"(Error formatting table: {e})"

class DocumentProcessor:
    @staticmethod
    def extract_text_and_chunks(file_path: str, file_type: str):
        pages_content = []
        ext = file_type.lower().strip(".")
        filename = os.path.basename(file_path)
        
        try:
            if ext in ["pdf"]:
                doc = fitz.open(file_path)
                for page_num in range(len(doc)):
                    page = doc[page_num]
                    text = page.get_text() or ""
                    # OCR Fallback if text extraction is minimal
                    if len(text.strip()) < 30:
                        try:
                            pix = page.get_pixmap()
                            img_path = f"{file_path}_p{page_num}.png"
                            pix.save(img_path)
                            ocr_text = pytesseract.image_to_string(Image.open(img_path))
                            if os.path.exists(img_path):
                                os.remove(img_path)
                            if len(ocr_text.strip()) > len(text.strip()):
                                text = ocr_text
                        except Exception as ocr_err:
                            print(f"[WARN] OCR fallback error for PDF page {page_num}: {ocr_err}")
                    pages_content.append({"page": page_num + 1, "text": text.strip() or f"(Page {page_num + 1} empty or scanned)"})
                if not pages_content:
                    pages_content.append({"page": 1, "text": f"(PDF document {filename} contains 0 pages)"})

            elif ext in ["docx"]:
                doc = docx.Document(file_path)
                text_blocks = []
                for p in doc.paragraphs:
                    if p.text.strip():
                        text_blocks.append(p.text.strip())
                for table in doc.tables:
                    for row in table.rows:
                        row_text = " | ".join([cell.text.strip() for cell in row.cells if cell.text.strip()])
                        if row_text:
                            text_blocks.append(row_text)
                full_text = "\n\n".join(text_blocks)
                pages_content.append({"page": 1, "text": full_text or f"(DOCX document {filename} has no text content)"})

            elif ext in ["xlsx", "xls", "csv"]:
                if ext == "csv":
                    try:
                        df = pd.read_csv(file_path)
                        pages_content.append({"page": 1, "text": f"CSV Content:\n{_format_dataframe(df)}"})
                    except Exception:
                        df = pd.read_csv(file_path, encoding="latin1")
                        pages_content.append({"page": 1, "text": f"CSV Content:\n{_format_dataframe(df)}"})
                else:
                    try:
                        with pd.ExcelFile(file_path, engine="openpyxl") as xl:
                            sheet_names = xl.sheet_names or ["Sheet1"]
                            for idx, sheet_name in enumerate(sheet_names):
                                try:
                                    df = xl.parse(sheet_name)
                                    formatted = _format_dataframe(df)
                                    pages_content.append({
                                        "page": idx + 1,
                                        "text": f"Sheet {idx + 1} ({sheet_name}):\n{formatted}"
                                    })
                                except Exception as sheet_err:
                                    pages_content.append({
                                        "page": idx + 1,
                                        "text": f"Sheet {idx + 1} ({sheet_name}): Error parsing sheet: {sheet_err}"
                                    })
                    except Exception:
                        try:
                            with pd.ExcelFile(file_path) as xl:
                                sheet_names = xl.sheet_names or ["Sheet1"]
                                for idx, sheet_name in enumerate(sheet_names):
                                    try:
                                        df = xl.parse(sheet_name)
                                        formatted = _format_dataframe(df)
                                        pages_content.append({
                                            "page": idx + 1,
                                            "text": f"Sheet {idx + 1} ({sheet_name}):\n{formatted}"
                                        })
                                    except Exception as sheet_err:
                                        pages_content.append({
                                            "page": idx + 1,
                                            "text": f"Sheet {idx + 1} ({sheet_name}): Error parsing sheet: {sheet_err}"
                                        })
                        except Exception as excel_open_err:
                            raise ValueError(f"Unable to read Excel workbook: {excel_open_err}")
                    
                    if not pages_content:
                        pages_content.append({"page": 1, "text": f"Excel file {filename} (empty sheets)"})

            elif ext in ["png", "jpg", "jpeg", "webp", "bmp", "tiff"]:
                ocr_text = ""
                try:
                    img = Image.open(file_path)
                    width, height = img.size
                    try:
                        ocr_text = pytesseract.image_to_string(img).strip()
                    except Exception as ocr_err:
                        print(f"[WARN] OCR failed for image {filename}: {ocr_err}")
                    
                    desc = f"Image Attachment: {filename} (Dimensions: {width}x{height} px, Format: {ext.upper()})"
                    if ocr_text:
                        combined_image_text = f"{desc}\nExtracted OCR Text / Diagram Labels:\n{ocr_text}"
                    else:
                        combined_image_text = f"{desc}\nVisual document attached: {filename}. Ready for visual inquiry and context retrieval."
                    pages_content.append({"page": 1, "text": combined_image_text})
                except Exception as img_err:
                    print(f"[ERROR] Image processing failed: {img_err}")
                    pages_content.append({"page": 1, "text": f"Image file: {filename}. Processing error: {img_err}"})

            elif ext in ["pptx"]:
                prs = Presentation(file_path)
                slide_count = len(prs.slides)
                for idx, slide in enumerate(prs.slides):
                    slide_lines = []
                    # Shape text
                    for shape in slide.shapes:
                        if hasattr(shape, "text") and shape.text and shape.text.strip():
                            slide_lines.append(shape.text.strip())
                        if shape.has_table:
                            for row in shape.table.rows:
                                row_str = " | ".join([c.text.strip() for c in row.cells if c.text.strip()])
                                if row_str:
                                    slide_lines.append(row_str)
                    # Speaker notes
                    try:
                        if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                            notes = slide.notes_slide.notes_text_frame.text.strip()
                            if notes:
                                slide_lines.append(f"[Speaker Notes]: {notes}")
                    except Exception:
                        pass
                    
                    slide_text = "\n".join(slide_lines).strip()
                    pages_content.append({
                        "page": idx + 1,
                        "text": f"Slide {idx + 1} of {slide_count}:\n{slide_text}" if slide_text else f"Slide {idx + 1} of {slide_count}: (No text content)"
                    })
                if not pages_content:
                    pages_content.append({"page": 1, "text": f"Presentation {filename} (0 slides)"})

            elif ext in ["html", "htm"]:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    soup = BeautifulSoup(f.read(), "html.parser")
                    pages_content.append({"page": 1, "text": soup.get_text()})

            else:  # txt, md, json, etc.
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    pages_content.append({"page": 1, "text": f.read() or f"({filename} is empty)"})

        except Exception as general_err:
            print(f"[ERROR] Failed to extract from {filename}: {general_err}")
            pages_content = [{"page": 1, "text": f"Document: {filename}\nError during extraction: {str(general_err)}"}]

        # Ensure at least 1 page
        if not pages_content:
            pages_content = [{"page": 1, "text": f"Document {filename} (No extractable text)"}]

        # Semantic Chunking
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = []
        for page_obj in pages_content:
            text_str = page_obj["text"]
            page_chunks = splitter.split_text(text_str) if text_str else []
            if not page_chunks:
                page_chunks = [text_str or f"Document {filename} Page {page_obj['page']}"]
            for idx, chunk in enumerate(page_chunks):
                chunks.append({
                    "text": chunk,
                    "page": page_obj["page"],
                    "chunk_idx": idx
                })

        return pages_content, chunks
