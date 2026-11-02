"""Renderiza cada página y comprueba geometría/texto de los tres PDF finales."""
from pathlib import Path
import hashlib
import json
import os
import re

import pymupdf
from pypdf import PdfReader
from PIL import Image, ImageDraw, ImageFont

BASE=Path(__file__).resolve().parent.parent
REVISION=Path(os.environ.get('PSIQUE_REVISION_DIR',str(BASE/'_revision')))
REVISION.mkdir(parents=True,exist_ok=True)
resultados=[]
for archivo in ['Documentacion_Funcional_PSIQUE.pdf','Documentacion_Tecnica_PSIQUE.pdf','Presentacion_PSIQUE.pdf']:
    p=BASE/archivo;doc=pymupdf.open(p);lector=PdfReader(p);carpeta=REVISION/p.stem;carpeta.mkdir(exist_ok=True)
    fallos=[];paginas=[]
    for i,pagina in enumerate(doc):
        texto=pagina.get_text()
        if len(texto.strip())<60:fallos.append(f'Página {i+1}: texto insuficiente.')
        if '\ufffd' in texto or '\u25a0' in texto:fallos.append(f'Página {i+1}: glifo sustituto.')
        if re.search(r'\b(TODO|LOREM IPSUM|PLACEHOLDER)\b',texto,re.I):fallos.append(f'Página {i+1}: marcador provisional.')
        for bloque in pagina.get_text('dict')['blocks']:
            for linea in bloque.get('lines',[]):
                for span in linea['spans']:
                    x0,y0,x1,y1=span['bbox']
                    if x0<-.8 or y0<-.8 or x1>pagina.rect.width+.8 or y1>pagina.rect.height+.8:fallos.append(f'Página {i+1}: texto fuera de límites: {span["text"][:50]}')
        for enlace in pagina.get_links():
            if enlace.get('kind')==pymupdf.LINK_GOTO and not 0<=enlace.get('page',-1)<len(doc):fallos.append(f'Página {i+1}: enlace interno incorrecto.')
        escala=1 if archivo.startswith('Presentacion') else 1.25
        pix=pagina.get_pixmap(matrix=pymupdf.Matrix(escala,escala),alpha=False)
        pix.save(carpeta/f'{i+1:02d}.png')
        paginas.append({'pagina':i+1,'caracteres':len(texto),'ancho':round(pagina.rect.width,2),'alto':round(pagina.rect.height,2)})
    # Contactos con texto lo bastante grande para detectar cortes y desequilibrios.
    lote=2 if archivo.startswith('Presentacion') else 3
    for inicio in range(0,len(doc),lote):
        if archivo.startswith('Presentacion'):
            contacto=Image.new('RGB',(1280,1485),'#e7eae6')
            for j in range(lote):
                if inicio+j>=len(doc):break
                im=Image.open(carpeta/f'{inicio+j+1:02d}.png');im.thumbnail((1280,720));contacto.paste(im,(0,j*745+20))
        else:
            contacto=Image.new('RGB',(1830,890),'#e7eae6')
            for j in range(lote):
                if inicio+j>=len(doc):break
                im=Image.open(carpeta/f'{inicio+j+1:02d}.png');im.thumbnail((590,842));contacto.paste(im,(j*610+10,25))
        contacto.save(carpeta/f'contacto-{inicio+1:02d}.jpg',quality=94)
    textoCompleto='\n'.join(p.get_text() for p in doc)
    # Solo patrones de credenciales reconocibles; no se leen secretos del entorno.
    sospechas=[]
    for patron,nombre in [(r'\bre_[A-Za-z0-9_]{20,}','clave de correo'),(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','JWT'),(r'postgres(?:ql)?://[^\s:/]+:[^\s@]+@','connection string con contraseña')]:
        if re.search(patron,textoCompleto):sospechas.append(nombre)
    if sospechas:fallos.extend(sospechas)
    if len(doc)!=len(lector.pages):fallos.append('Cantidad de páginas inconsistente entre lectores.')
    if archivo.startswith('Presentacion') and any(abs(p.rect.width/p.rect.height-16/9)>.001 for p in doc):fallos.append('Presentación fuera de 16:9.')
    resultados.append({'archivo':archivo,'paginas':len(doc),'renderizadas':len(paginas),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'fallos':fallos,'detalle':paginas})
    print(archivo,len(doc),'páginas',len(fallos),'observaciones')
(BASE/'evidencias/verificacion-pdf.json').write_text(json.dumps(resultados,ensure_ascii=False,indent=2),encoding='utf-8')
if any(r['fallos'] for r in resultados):raise SystemExit(1)
