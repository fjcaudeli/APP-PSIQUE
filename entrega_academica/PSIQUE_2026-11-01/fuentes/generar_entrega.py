"""Genera los PDF y fuentes visuales de la entrega, sin acceder a la API o a bases.
Los informes se editan en Markdown. Las diapositivas se editan en presentacion.json.
"""
from pathlib import Path
from xml.sax.saxutils import escape as xml
import base64
import hashlib
import html
import json
import re
import textwrap
import os

from PIL import Image as PilImage
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle, Image, Frame, Preformatted, Flowable, KeepTogether

BASE = Path(__file__).resolve().parent.parent
FUENTES = BASE / 'fuentes'
CAPTURAS = BASE / 'recursos' / 'capturas'
DIAGRAMAS = BASE / 'recursos' / 'diagramas'
REVISION = Path(os.environ.get('PSIQUE_REVISION_DIR', str(BASE / '_revision')))
W, H = A4
MARGEN = 48
ANCHO = W - 2 * MARGEN
VERDE = '#284f45'
TEXTO = '#293b34'
GRIS = '#647168'
PAPEL = '#faf9f5'
LINEA = '#cdd9cf'
SALVIA = '#e8eee3'
AMARILLO = '#fff5c6'
TEAL = '#dcece8'

def fuentes():
    carpeta = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'
    opciones = [('segoeui.ttf','segoeuib.ttf','segoeuii.ttf'), ('arial.ttf','arialbd.ttf','ariali.ttf')]
    for normal, negrita, cursiva in opciones:
        if (carpeta / normal).exists():
            for nombre, archivo in [('Psique',normal),('Psique-Bold',negrita),('Psique-Italic',cursiva)]:
                pdfmetrics.registerFont(TTFont(nombre, str(carpeta / archivo)))
            pdfmetrics.registerFontFamily('Psique',normal='Psique',bold='Psique-Bold',italic='Psique-Italic',boldItalic='Psique-Bold')
            return
    # ReportLab distribuye Vera para poder regenerar sin copiar fuentes de Windows.
    import reportlab
    carpeta = Path(reportlab.__file__).parent / 'fonts'
    for nombre, archivo in [('Psique','Vera.ttf'),('Psique-Bold','VeraBd.ttf'),('Psique-Italic','VeraIt.ttf')]:
        pdfmetrics.registerFont(TTFont(nombre, str(carpeta / archivo)))
    pdfmetrics.registerFontFamily('Psique',normal='Psique',bold='Psique-Bold',italic='Psique-Italic',boldItalic='Psique-Bold')

fuentes()
ESTILO = ParagraphStyle('Texto',fontName='Psique',fontSize=10.6,leading=14.6,textColor=colors.HexColor(TEXTO),spaceAfter=8,splitLongWords=True)
TITULO = ParagraphStyle('Titulo',parent=ESTILO,fontName='Psique-Bold',fontSize=23,leading=28,textColor=colors.HexColor(VERDE),spaceAfter=15)
SUBTITULO = ParagraphStyle('Subtitulo',parent=ESTILO,fontName='Psique-Bold',fontSize=12.4,leading=16,spaceBefore=7,spaceAfter=6,textColor=colors.HexColor(VERDE),keepWithNext=True)
PIE = ParagraphStyle('Pie',parent=ESTILO,fontSize=8.4,leading=11,textColor=colors.HexColor(GRIS),spaceAfter=9)
CELDA = ParagraphStyle('Celda',parent=ESTILO,fontSize=9.1,leading=12,spaceAfter=0)
CELDA_CAB = ParagraphStyle('Cabecera',parent=CELDA,fontName='Psique-Bold',textColor=colors.HexColor(VERDE))

def inline(t):
    t=html.escape(t)
    t=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',t)
    t=re.sub(r'`([^`]+)`',r'<font name="Courier">\1</font>',t)
    return t

def preparar_recortes():
    # Solo recorta capturas reales. No cambia contenido, colores ni datos de la UI.
    recortes={
      'login':('01-login.png',(40,340,1040,1930)),
      'inicio':('02-inicio.png',(35,315,1045,1500)),
      'pacientes':('03-pacientes.png',(40,1020,1040,1780)),
      'pacientes-lista':('03-pacientes.png',(40,1020,1040,1775)),
      'ficha':('04-ficha.png',(50,500,1030,2050)),
      'ficha-nota':('05-ficha-nota.png',(50,540,1030,2070)),
      'agenda':('08-agenda-amplia.png',(125,410,1475,840)),
      'agenda-detalle':('08-agenda-amplia.png',(135,500,710,830)),
      'reserva':('09-reserva.png',(150,77,1450,850)),
      'detalle':('10-detalle.png',(45,760,1035,1840)),
      'honorarios':('11-honorarios-resumen.png',(40,1525,1040,2050)),
      'historico':('13-historico.png',(55,1020,1025,2130)),
      'nota-modal':('15-nota-modal.png',(60,870,1020,1550)),
      'notas':('14-notas.png',(55,930,1025,1700)),
      'cobros':('16-cobros.png',(28,300,1052,1270)),
      'agendadas':('17-sesiones-agendadas.png',(55,1030,1025,2130)),
      'paciente-bloqueado':('12-edicion-bloqueada.png',(55,110,1025,650)),
    }
    registro=[]
    for nombre,(origen,caja) in recortes.items():
        im=PilImage.open(CAPTURAS/origen).convert('RGB')
        destino=CAPTURAS/('recorte-'+nombre+'.png')
        im.crop(caja).save(destino,optimize=True)
        registro.append({'archivo':destino.name,'origen':origen,'caja':list(caja),'operacion':'recorte sin alteracion de contenido'})
    (BASE/'evidencias/recortes.json').write_text(json.dumps(registro,ensure_ascii=False,indent=2),encoding='utf-8')

def envolver(t,ancho,tamano,negrita=False):
    salida=[]
    for parrafo in str(t).split('\n'):
        linea=''
        for palabra in parrafo.split():
            prueba=(linea+' '+palabra).strip()
            if pdfmetrics.stringWidth(prueba,'Psique-Bold' if negrita else 'Psique',tamano)>ancho and linea:
                salida.append(linea); linea=palabra
            else: linea=prueba
        salida.append(linea)
    return salida

class Escena:
    def __init__(self,w=1100,h=600): self.w=w;self.h=h;self.objetos=[]
    def rect(self,x,y,w,h,relleno=SALVIA,borde=None,radio=12): self.objetos.append(dict(tipo='rect',x=x,y=y,w=w,h=h,relleno=relleno,borde=borde,radio=radio))
    def linea(self,puntos,color=VERDE,grueso=2,flecha=False): self.objetos.append(dict(tipo='linea',puntos=puntos,color=color,grueso=grueso,flecha=flecha))
    def texto(self,t,x,y,w,tamano=24,color=TEXTO,negrita=False,linea=None):
        lineas=envolver(t,w,tamano,negrita); paso=linea or tamano*1.32
        self.objetos.append(dict(tipo='texto',texto=t,lineas=lineas,x=x,y=y,w=w,tamano=tamano,color=color,negrita=negrita,paso=paso))
        return len(lineas)*paso
    def imagen(self,archivo,x,y,w,h,borde=True): self.objetos.append(dict(tipo='imagen',archivo=archivo,x=x,y=y,w=w,h=h,borde=borde))
    def pintar(self,c):
        for o in self.objetos:
            tipo=o['tipo']
            if tipo=='rect':
                c.setFillColor(colors.HexColor(o['relleno']));c.setStrokeColor(colors.HexColor(o['borde'] or o['relleno']))
                c.roundRect(o['x'],self.h-o['y']-o['h'],o['w'],o['h'],o['radio'],stroke=bool(o['borde']),fill=1)
            elif tipo=='texto':
                c.setFont('Psique-Bold' if o['negrita'] else 'Psique',o['tamano']);c.setFillColor(colors.HexColor(o['color']))
                for i,l in enumerate(o['lineas']): c.drawString(o['x'],self.h-o['y']-o['tamano']-i*o['paso'],l)
            elif tipo=='linea':
                c.setStrokeColor(colors.HexColor(o['color']));c.setLineWidth(o['grueso'])
                p=c.beginPath();p.moveTo(o['puntos'][0][0],self.h-o['puntos'][0][1])
                for x,y in o['puntos'][1:]:p.lineTo(x,self.h-y)
                c.drawPath(p)
                if o['flecha']:
                    x,y=o['puntos'][-1];a,b=o['puntos'][-2];dx=x-a;dy=y-b;norm=max((dx*dx+dy*dy)**.5,1);ux=dx/norm;uy=dy/norm
                    p=c.beginPath();p.moveTo(x,self.h-y);p.lineTo(x-ux*10-uy*5,self.h-(y-uy*10+ux*5));p.lineTo(x-ux*10+uy*5,self.h-(y-uy*10-ux*5));p.close();c.setFillColor(colors.HexColor(o['color']));c.drawPath(p,fill=1,stroke=0)
            elif tipo=='imagen':
                p=BASE/o['archivo'];im=PilImage.open(p); iw,ih=im.size;esc=min(o['w']/iw,o['h']/ih);aw,ah=iw*esc,ih*esc;x=o['x']+(o['w']-aw)/2;y=o['y']+(o['h']-ah)/2
                c.drawImage(str(p),x,self.h-y-ah,width=aw,height=ah,mask='auto')
                if o['borde']:c.setStrokeColor(colors.HexColor(LINEA));c.setLineWidth(1);c.rect(x,self.h-y-ah,aw,ah,stroke=1,fill=0)
    def svg(self):
        partes=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}">', '<defs><marker id="flecha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="'+VERDE+'"/></marker></defs>']
        for o in self.objetos:
            if o['tipo']=='rect':partes.append(f'<rect x="{o["x"]}" y="{o["y"]}" width="{o["w"]}" height="{o["h"]}" rx="{o["radio"]}" fill="{o["relleno"]}" stroke="{o["borde"] or o["relleno"]}"/>')
            elif o['tipo']=='texto':
                partes.append(f'<text font-family="Segoe UI, Arial, sans-serif" font-size="{o["tamano"]}" font-weight="{700 if o["negrita"] else 400}" fill="{o["color"]}">')
                for i,l in enumerate(o['lineas']):partes.append(f'<tspan x="{o["x"]}" y="{o["y"]+o["tamano"]+i*o["paso"]}">{xml(l)}</tspan>')
                partes.append('</text>')
            elif o['tipo']=='linea':
                puntos=' '.join(f'{x},{y}' for x,y in o['puntos']); marcador=' marker-end="url(#flecha)"' if o['flecha'] else ''
                partes.append(f'<polyline points="{puntos}" fill="none" stroke="{o["color"]}" stroke-width="{o["grueso"]}"{marcador}/>')
            elif o['tipo']=='imagen':
                im=PilImage.open(BASE/o['archivo']);iw,ih=im.size;esc=min(o['w']/iw,o['h']/ih);aw,ah=iw*esc,ih*esc;x=o['x']+(o['w']-aw)/2;y=o['y']+(o['h']-ah)/2
                datos=base64.b64encode((BASE/o['archivo']).read_bytes()).decode()
                partes.append(f'<image x="{x}" y="{y}" width="{aw}" height="{ah}" href="data:image/png;base64,{datos}"/>')
                if o['borde']:partes.append(f'<rect x="{x}" y="{y}" width="{aw}" height="{ah}" fill="none" stroke="{LINEA}"/>')
        partes.append('</svg>');return '\n'.join(partes)

def caja(s,x,y,w,h,titulo,cuerpo,relleno=SALVIA,tamano=23):
    s.rect(x,y,w,h,relleno,LINEA)
    s.texto(titulo,x+20,y+14,w-40,29,VERDE,True)
    s.texto(cuerpo,x+20,y+58,w-40,tamano)

def diagramas():
    resultado={}
    s=Escena(1100,620)
    caja(s,40,25,1000,125,'Presentación: Ionic + Angular','Navegador web o APK Android con Capacitor. Formularios y servicios HTTP.',TEAL,24)
    caja(s,40,245,670,125,'Aplicación: Node.js + Express','API REST, JWT, reglas de negocio y pool pg. Máximo: 5 conexiones.',SALVIA,24)
    caja(s,790,245,270,125,'Resend','Correo de acceso\npor HTTPS.',AMARILLO,23)
    caja(s,40,465,670,125,'Persistencia: PostgreSQL 18.6','psique: usuarios, pacientes, turnos y sesiones. Historial técnico de migraciones.',SALVIA,24)
    s.linea([(360,150),(360,245)],flecha=True);s.texto('HTTP + JSON / Bearer',390,176,400,23)
    s.linea([(360,370),(360,465)],flecha=True);s.texto('SQL parametrizado',390,397,350,23)
    s.linea([(710,305),(790,305)],flecha=True)
    resultado['arquitectura']=s
    s=Escena(1100,620)
    for x,t in [(20,'Cliente Angular'),(410,'API Express'),(800,'PostgreSQL')]:s.texto(t,x,5,280,28,VERDE,True)
    caja(s,20,80,280,125,'1. Acceso','Email y contraseña',TEAL)
    caja(s,410,80,280,125,'2. Validación','Formato y búsqueda',SALVIA)
    caja(s,800,80,280,125,'3. Cuenta','Hash y confirmación',SALVIA)
    s.linea([(300,142),(410,142)],flecha=True);s.linea([(690,142),(800,142)],flecha=True)
    caja(s,410,295,280,125,'4. Login','Argon2id y JWT HS256',SALVIA)
    caja(s,20,295,280,125,'5. Sesión','Token con vencimiento',TEAL)
    s.linea([(940,205),(940,252),(550,252),(550,295)],flecha=True)
    s.linea([(410,355),(300,355)],flecha=True)
    caja(s,20,490,280,115,'6. HTTP privado','Bearer en la API',TEAL)
    caja(s,410,490,280,115,'7. Middleware','JWT y usuario vigente',SALVIA)
    caja(s,800,490,280,115,'8. Consulta','Filtra por usuarioId',SALVIA)
    s.linea([(155,420),(155,490)],flecha=True)
    s.linea([(300,545),(410,545)],flecha=True);s.linea([(690,545),(800,545)],flecha=True)
    resultado['autenticacion']=s
    s=Escena(1120,700)
    caja(s,20,25,280,155,'usuarios','PK id\nemail único\ncredenciales y enlaces',TEAL,22)
    caja(s,430,25,300,205,'pacientes','PK usuarioId + codigo\nFK usuarioId\nmodalidad, estado\nNota y fechas',SALVIA,22)
    caja(s,430,375,300,190,'turnos','PK usuarioId + fecha\n   + horario\nFK paciente compuesto\nestado y asignación',SALVIA,22)
    caja(s,820,240,280,300,'sesiones','PK id\nFK usuarioId\nFK paciente compuesto\nFK turno compuesto\nfecha y duración\nestado y resumen\nimportes en centavos',SALVIA,22)
    caja(s,20,550,280,120,'migraciones','Historial técnico\nsin relación clínica',AMARILLO,21)
    s.linea([(300,100),(430,100)],flecha=True);s.texto('1 : N',329,66,90,21)
    s.linea([(160,180),(160,455),(430,455)],flecha=True);s.texto('1 : N',185,421,90,21)
    s.linea([(60,180),(60,505),(345,505),(345,640),(1105,640),(1105,400),(1100,400)],flecha=True);s.texto('usuarios 1 : N sesiones',735,648,300,20)
    s.linea([(730,130),(770,130),(770,305),(820,305)],flecha=True);s.texto('1 : N',763,182,90,21)
    s.linea([(580,230),(580,375)],flecha=True);s.texto('0..1 : N',596,289,150,21)
    s.linea([(730,465),(820,465)],flecha=True);s.texto('1 : N',735,425,90,21)
    resultado['modelo']=s
    # El informe conserva el ER detallado. La exposición usa sus mismas relaciones
    # con menos atributos para que pueda leerse desde un proyector.
    s=Escena(1140,570)
    caja(s,430,10,280,135,'usuarios','PK id\nCuenta profesional',TEAL,26)
    caja(s,20,300,300,155,'pacientes','PK usuarioId + codigo',SALVIA,25)
    caja(s,420,300,300,155,'turnos','PK usuarioId + fecha\n+ horario',SALVIA,25)
    caja(s,820,300,300,155,'sesiones','PK id\nFK con propietario',SALVIA,25)
    s.linea([(570,145),(570,220),(170,220),(170,300)],flecha=True)
    s.linea([(570,145),(570,300)],flecha=True)
    s.linea([(570,220),(970,220),(970,300)],flecha=True)
    for x in [185,585,985]:s.texto('1 : N',x,248,100,23)
    s.linea([(320,380),(420,380)],flecha=True);s.texto('0..1 : N',323,344,100,19)
    s.linea([(720,380),(820,380)],flecha=True);s.texto('1 : N',740,344,85,20)
    s.linea([(170,455),(170,522),(970,522),(970,455)],flecha=True)
    s.texto('Paciente 1 : N sesiones. Relaciones compuestas con usuarioId.',230,530,770,23,VERDE)
    resultado['modelo-resumen']=s
    s=Escena(1100,610)
    caja(s,20,80,300,245,'Android','WebView local\nhttps://localhost\nAPI: 127.0.0.1:3000\nLoopback del dispositivo',TEAL,23)
    caja(s,410,80,270,245,'ADB reverse','USB o emulador\n\nDispositivo :3000\na PC :3000',AMARILLO,23)
    caja(s,780,80,300,245,'PC / Express','127.0.0.1:3000\n\nCORS Android exacto\nJWT y reglas',SALVIA,23)
    caja(s,780,445,300,145,'PostgreSQL','psique / psique_app\nNo está dentro del APK.',SALVIA,23)
    s.linea([(320,210),(410,210)],flecha=True);s.linea([(680,210),(780,210)],flecha=True);s.linea([(930,325),(930,445)],flecha=True)
    s.texto('APK local: requiere PC, API, PostgreSQL y túnel activos.\nAPI remota HTTPS y teléfono físico: pendientes de prueba.',30,450,670,25,VERDE,True)
    resultado['android']=s
    for nombre,s in resultado.items():
        (DIAGRAMAS/(nombre+'.svg')).write_text(s.svg(),encoding='utf-8')
        (DIAGRAMAS/(nombre+'.json')).write_text(json.dumps({'ancho':s.w,'alto':s.h,'objetos':s.objetos},ensure_ascii=False,indent=2),encoding='utf-8')
    return resultado

class Diagrama(Flowable):
    def __init__(self,escena,ancho=ANCHO):
        Flowable.__init__(self);self.escena=escena;self.width=ancho;self.height=ancho*escena.h/escena.w
    def draw(self):
        self.canv.saveState();self.canv.scale(self.width/self.escena.w,self.width/self.escena.w);self.escena.pintar(self.canv);self.canv.restoreState()

def tabla(lineas):
    datos=[]
    for i,l in enumerate(lineas):
        if i==1:continue
        datos.append([Paragraph(inline(x.strip()),CELDA_CAB if i==0 else CELDA) for x in l.strip().strip('|').split('|')])
    n=len(datos[0]); cab=' '.join(lineas[:1]).lower()
    if n==2:anchos=[ANCHO*.40,ANCHO*.60] if 'variable' in cab else [ANCHO*.30,ANCHO*.70]
    else:anchos=[ANCHO*.30,ANCHO*.28,ANCHO*.42] if 'versión' in cab else [ANCHO*.29,ANCHO*.29,ANCHO*.42]
    t=Table(datos,colWidths=anchos,hAlign='LEFT',repeatRows=1)
    t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(-1,0),colors.HexColor(SALVIA)),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f3f5f0')]),('LINEBELOW',(0,0),(-1,0),.7,colors.HexColor(LINEA)),('LINEBELOW',(0,-1),(-1,-1),.4,colors.HexColor(LINEA)),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
    return t

def elementos(texto,escenas,alto_imagen=300):
    lineas=texto.strip().splitlines();flujo=[];i=0
    while i<len(lineas):
        l=lineas[i].strip()
        if not l:i+=1;continue
        if l.startswith('# '):flujo.append(Paragraph(inline(l[2:]),TITULO));i+=1;continue
        if l.startswith('## '):flujo.append(Paragraph(inline(l[3:]),SUBTITULO));i+=1;continue
        if l.startswith('```'):
            codigo=[];i+=1
            while i<len(lineas) and not lineas[i].startswith('```'):codigo.append(lineas[i]);i+=1
            tam=min(8.3, (ANCHO-20)/max([pdfmetrics.stringWidth(x,'Courier',1) for x in codigo] or [1]))
            st=ParagraphStyle('Codigo',fontName='Courier',fontSize=tam,leading=tam*1.45,backColor=colors.HexColor('#f0f2ed'),borderPadding=9,spaceBefore=6,spaceAfter=13,textColor=colors.HexColor(TEXTO))
            flujo.append(Preformatted('\n'.join(codigo),st));i+=1;continue
        if l.startswith('|'):
            grupo=[]
            while i<len(lineas) and lineas[i].strip().startswith('|'):grupo.append(lineas[i]);i+=1
            flujo.extend([tabla(grupo),Spacer(1,11)]);continue
        if l.startswith(':::diagrama'):
            flujo.extend([Diagrama(escenas[l.split()[1]]),Spacer(1,12)]);i+=1;continue
        m=re.match(r'!\[(.*?)\]\((.*?)\)',l)
        if m:
            p=(FUENTES/m.group(2)).resolve();im=PilImage.open(p);iw,ih=im.size;factor=min(ANCHO/iw,alto_imagen/ih)
            figura=Image(str(p),width=iw*factor,height=ih*factor);figura.hAlign='CENTER'
            leyenda=m.group(1)
            if 'fictici' not in leyenda.lower():leyenda+=' Datos ficticios.'
            flujo.extend([figura,Spacer(1,5),Paragraph(inline(leyenda),PIE)]);i+=1;continue
        if l.startswith('- ') or re.match(r'^\d+\. ',l):
            pref='-' if l.startswith('- ') else l.split('. ',1)[0]+'.'
            cuerpo=l[2:] if l.startswith('- ') else l.split('. ',1)[1]
            flujo.append(Paragraph(inline(cuerpo),ParagraphStyle('Lista',parent=ESTILO,leftIndent=13,firstLineIndent=0,bulletIndent=0,bulletFontName='Psique',bulletFontSize=10,spaceAfter=6),bulletText=pref));i+=1;continue
        par=[l];i+=1
        while i<len(lineas) and lineas[i].strip() and not re.match(r'^(#|\||!\[|```|:::|- |\d+\. )',lineas[i].strip()):par.append(lineas[i].strip());i+=1
        t=' '.join(par)
        flujo.append(Paragraph(inline(t),PIE if t.startswith(('Fuente:','Fuentes:','Referencia')) else ESTILO))
    return flujo

def cabecera(c,titulo,pagina,total):
    c.setFillColor(colors.HexColor(PAPEL));c.rect(0,0,W,H,stroke=0,fill=1)
    c.setFillColor(colors.HexColor(VERDE));c.setFont('Psique-Bold',9);c.drawString(MARGEN,H-34,'PSIQUE')
    c.setFillColor(colors.HexColor(GRIS));c.setFont('Psique',8);c.drawRightString(W-MARGEN,H-34,titulo)
    c.setStrokeColor(colors.HexColor(LINEA));c.setLineWidth(.5);c.line(MARGEN,H-44,W-MARGEN,H-44);c.line(MARGEN,42,W-MARGEN,42)
    c.setFont('Psique',8);c.drawString(MARGEN,28,'Proyecto Final · Franco José Caudeli · 01/11/2026');c.drawRightString(W-MARGEN,28,f'{pagina} / {total}')

def portada(c,titulo,tipo,total):
    c.setFillColor(colors.HexColor(PAPEL));c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(colors.HexColor(VERDE));c.rect(0,0,15,H,fill=1,stroke=0)
    c.setFont('Psique-Bold',13);c.drawString(55,763,'INSTITUTO JUAN AMÓS COMENIO')
    c.setFont('Psique',12);c.drawString(55,739,'Analista de Sistemas · Proyecto Final')
    c.setFont('Psique-Bold',66);c.drawString(52,583,'PSIQUE')
    c.setFont('Psique',17);c.drawString(55,546,'Seguimiento psicoterapéutico');c.drawString(55,521,'y administración de consultorio')
    p=Paragraph(titulo,ParagraphStyle('Cubierta',fontName='Psique-Bold',fontSize=29,leading=35,textColor=colors.HexColor(VERDE)))
    _,alto=p.wrap(ANCHO-20,150);p.drawOn(c,55,438-alto)
    c.setStrokeColor(colors.HexColor(LINEA));c.line(55,325,W-55,325)
    c.setFont('Psique',11);c.setFillColor(colors.HexColor(GRIS));c.drawString(55,288,'AUTOR');c.drawString(55,217,'DOCENTE')
    c.setFillColor(colors.HexColor(VERDE));c.setFont('Psique-Bold',17);c.drawString(55,262,'Franco José Caudeli');c.drawString(55,191,'Julián Speciale')
    c.setFont('Psique',11);c.drawString(55,116,'Edición académica · 1 de noviembre de 2026')
    c.setFillColor(colors.HexColor(GRIS));c.setFont('Psique',9);c.drawString(55,91,tipo+' · Versión 1.0');c.drawRightString(W-48,28,f'1 / {total}')

def informe(archivo,titulo,escenas):
    bloques=(FUENTES/(archivo+'.md')).read_text(encoding='utf-8').split('<!-- PAGE -->')
    total=len(bloques)+2
    c=canvas.Canvas(str(BASE/(archivo+'.pdf')),pagesize=A4,pageCompression=1)
    c.setTitle(titulo+' - PSIQUE');c.setAuthor('Franco José Caudeli');c.setSubject('Proyecto Final - Instituto Juan Amós Comenio');c.setCreator('Fuentes editables de la entrega PSIQUE')
    portada(c,titulo,'Informe funcional' if 'Funcional' in archivo else 'Informe técnico',total);c.showPage()
    cabecera(c,titulo,2,total)
    c.bookmarkPage('contenido');c.addOutlineEntry('Contenido','contenido',0)
    flujo=[Paragraph('Contenido',TITULO),Paragraph('Lectura orientada a la versión comprobada al 01/11/2026. Las capturas contienen datos ficticios y los estados pendientes se identifican expresamente.',ESTILO),Spacer(1,8)]
    tam=9.8 if len(bloques)>23 else 11
    estiloIndice=ParagraphStyle('Indice',parent=ESTILO,fontSize=tam,leading=tam*1.4,spaceAfter=5)
    for i,b in enumerate(bloques):
        t=next(x[2:].strip() for x in b.splitlines() if x.startswith('# '))
        fila=Table([[Paragraph(f'<link href="#seccion-{i}">{inline(t)}</link>',estiloIndice),Paragraph(str(i+3),estiloIndice)]],colWidths=[ANCHO-30,30])
        fila.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),1),('TOPPADDING',(0,0),(-1,-1),0)]));flujo.append(fila)
    Frame(MARGEN,58,ANCHO,H-123,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0).addFromList(flujo,c)
    if flujo:raise RuntimeError('El índice no entra en una página: '+archivo)
    c.showPage();control=[]
    for i,b in enumerate(bloques):
        tituloSeccion=next(x[2:].strip() for x in b.splitlines() if x.startswith('# '))
        # Reducir solamente la altura de las imágenes si una página excede su marco.
        # El texto conserva tamaño y el número de páginas permanece estable.
        for alto in [300,265,230,200,170]:
            lienzoPrueba=canvas.Canvas(os.devnull,pagesize=A4)
            f=elementos(b,escenas,alto)
            Frame(MARGEN,58,ANCHO,H-121,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0).addFromList(f,lienzoPrueba)
            if not f:break
        if f:raise RuntimeError(f'Contenido fuera de página: {archivo}, página {i+3}, {tituloSeccion}. Restan {len(f)} bloques')
        cabecera(c,titulo,i+3,total);c.bookmarkPage(f'seccion-{i}');c.addOutlineEntry(tituloSeccion,f'seccion-{i}',0)
        f=elementos(b,escenas,alto)
        Frame(MARGEN,58,ANCHO,H-121,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0).addFromList(f,c)
        if f:raise RuntimeError('Diferencia inesperada en maquetación.')
        c.showPage();control.append({'pagina':i+3,'titulo':tituloSeccion,'altoMaximoImagen':alto})
    c.save();return {'archivo':archivo+'.pdf','paginas':total,'secciones':control}

def diapositivas(escenas):
    datos=json.loads((FUENTES/'presentacion.json').read_text(encoding='utf-8'))
    carpeta=FUENTES/'diapositivas';carpeta.mkdir(exist_ok=True)
    c=canvas.Canvas(str(BASE/'Presentacion_PSIQUE.pdf'),pagesize=(1280,720),pageCompression=1)
    c.setTitle('PSIQUE - Presentación del Proyecto Final');c.setAuthor('Franco José Caudeli');c.setCreator('Fuentes editables de la entrega PSIQUE')
    paginas=[];guion=['# Guion de exposición de PSIQUE','', '15 diapositivas. Duración orientativa: 12 a 15 minutos. Los números son resultados de pruebas o datos ficticios, según el contexto.','']
    for i,d in enumerate(datos):
        s=Escena(1280,720);s.rect(0,0,1280,720,PAPEL,radio=0)
        if i==0:
            s.rect(0,0,23,720,VERDE,radio=0);s.texto('INSTITUTO JUAN AMÓS COMENIO',65,45,1100,23,VERDE,True)
            s.texto('Analista de Sistemas · Proyecto Final',65,85,1100,22,GRIS)
            s.texto('PSIQUE',60,205,1130,116,VERDE,True)
            s.texto('Seguimiento psicoterapéutico\ny administración de consultorio',66,355,1100,36,VERDE)
            s.texto('Franco José Caudeli\nDocente: Julián Speciale',67,540,800,25)
            s.texto('1 de noviembre de 2026',900,643,310,20,GRIS)
        else:
            s.texto(d['titulo'],55,30,1170,42,VERDE,True)
            if d.get('bajada'):s.texto(d['bajada'],58,91,1160,23,GRIS)
            layout=d['layout']
            if layout=='problema':
                for j,item in enumerate(d['items']):
                    y=177+j*142;s.texto(f'0{j+1}',62,y,100,51,VERDE,True);s.texto(item['titulo'],190,y+3,1000,31,VERDE,True);s.texto(item['texto'],190,y+52,960,25)
            elif layout=='flujo':
                for j,item in enumerate(d['items']):
                    x=55+j*245;s.texto(str(j+1),x,190,180,65,VERDE,True);s.texto(item['titulo'],x,285,200,29,VERDE,True);s.texto(item['texto'],x,386,200,24)
                    if j<4:s.linea([(x+198,245),(x+233,245)],flecha=True)
                s.texto(d['cierre'],58,590,1160,27,VERDE,True)
            elif layout=='diagrama':
                nombre=d['diagrama'];e=escenas[nombre];esc=min(1150/e.w,460/e.h);ox=(1280-e.w*esc)/2;oy=150
                for o in e.objetos:s.objetos.append(escalar(o,esc,ox,oy))
                if d.get('cierre'):s.texto(d['cierre'],58,625,1160,22,GRIS)
            elif layout=='stack':
                for j,item in enumerate(d['items']):
                    x=60+(j%2)*615;y=170+(j//2)*220
                    s.linea([(x,y),(x+545,y)],LINEA,2);s.texto(item['titulo'],x,y+15,545,33,VERDE,True);s.texto(item['texto'],x,y+78,530,26)
            elif layout=='seguridad':
                s.imagen('recursos/capturas/recorte-login.png',60,160,390,480)
                for j,item in enumerate(d['items']):
                    y=170+j*140;s.texto(item['titulo'],500,y,700,31,VERDE,True);s.texto(item['texto'],500,y+48,690,26)
            elif layout=='inicio':
                s.imagen('recursos/capturas/recorte-inicio.png',650,148,555,490)
                for j,item in enumerate(d['items']):
                    y=180+j*145;s.texto(item['titulo'],60,y,540,31,VERDE,True);s.texto(item['texto'],60,y+48,535,25)
            elif layout=='pacientes':
                s.imagen('recursos/capturas/recorte-pacientes-lista.png',55,164,540,405)
                s.imagen('recursos/capturas/recorte-ficha.png',665,150,550,440)
                s.texto('Código propio, estado y próxima fecha',55,599,550,25,VERDE,True);s.texto('Edición, baja e histórico individual',665,599,550,25,VERDE,True)
            elif layout=='agenda':
                s.imagen('recursos/capturas/recorte-agenda.png',48,156,1184,380)
                for j,t in enumerate(d['items']):s.texto(t,65+j*405,566,365,26,VERDE,True)
            elif layout=='seguimiento':
                s.texto('Resumen de la sesión',55,155,560,29,VERDE,True);s.texto('Nota del próximo encuentro',680,155,550,29,VERDE,True)
                s.imagen('recursos/capturas/recorte-historico.png',55,215,540,365)
                s.imagen('recursos/capturas/recorte-nota-modal.png',675,215,540,365)
                s.texto('Hasta 100 caracteres. Queda en el histórico.',55,605,560,23,GRIS);s.texto('Hasta 300 caracteres. Es una Nota vigente.',680,605,550,23,GRIS)
            elif layout=='cobros':
                s.texto('30.000 - 15.000 = 15.000',60,150,1160,49,VERDE,True)
                s.texto('Honorarios, cobrado acumulado y saldo en ARS. Ejemplo ficticio.',60,224,1160,24,GRIS)
                s.imagen('recursos/capturas/recorte-honorarios.png',55,300,610,305)
                s.imagen('recursos/capturas/recorte-cobros.png',735,285,470,340)
                s.texto('Pendiente: sesión Realizada con saldo positivo',60,640,1100,24,VERDE,True)
            elif layout=='android':
                s.imagen('recursos/capturas/17-sesiones-agendadas.png',65,146,280,505)
                for j,item in enumerate(d['items']):
                    y=170+j*143;s.texto(item['titulo'],410,y,795,31,VERDE,True);s.texto(item['texto'],410,y+49,790,27)
            elif layout=='pruebas':
                for j,item in enumerate(d['items']):
                    x=65+j*410;s.texto(item['numero'],x,180,365,95,VERDE,True);s.texto(item['titulo'],x,300,365,29,VERDE,True);s.texto(item['texto'],x,360,350,25)
                s.linea([(65,510),(1210,510)],LINEA,2);s.texto('APK compilado, firmado e instalado en emulador',65,545,1140,30,VERDE,True)
                s.texto('Logs y evidencias reproducibles incluidos en la entrega',65,595,1140,25,GRIS)
            elif layout=='estado':
                s.texto('Implementado y comprobado',60,175,550,32,VERDE,True)
                s.texto(d['actual'],60,250,535,29)
                s.texto('Pendiente de validación',690,175,535,32,VERDE,True)
                s.texto(d['pendiente'],690,250,525,29)
                s.linea([(640,170),(640,573)],LINEA,2)
                s.texto('Entrega: funcionamiento documentado, código y evidencia',60,620,1160,29,VERDE,True)
            else:raise ValueError(layout)
            s.texto('PSIQUE',59,681,500,15,GRIS);s.texto(f'{i+1:02d} / {len(datos):02d}',1140,681,90,15,GRIS)
        c.bookmarkPage(f'slide-{i}');c.addOutlineEntry(d['titulo'],f'slide-{i}',0);s.pintar(c);c.showPage()
        svg=s.svg();(carpeta/f'{i+1:02d}.svg').write_text(svg,encoding='utf-8');paginas.append(svg)
        guion.extend([f'## {i+1}. {d["titulo"]}',d['notas'],'', 'Fuentes: '+d['fuentes'],''])
    c.save();(FUENTES/'Guion_Presentacion_PSIQUE.md').write_text('\n'.join(guion),encoding='utf-8')
    html_slides='\n'.join('<section class="slide">'+svg+'</section>' for svg in paginas)
    html_final='''<!doctype html><html lang="es"><meta charset="utf-8"><title>PSIQUE - Presentación</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#263b33;font-family:"Segoe UI",Arial,sans-serif}.slide{display:none;max-width:1280px;margin:auto;height:100vh;align-items:center;justify-content:center}.slide.activa{display:flex}svg{width:100%;max-height:100vh}nav{position:fixed;bottom:8px;right:16px;z-index:2}button{padding:7px 14px;border:1px solid #cdd9cf;border-radius:6px;background:#faf9f5;color:#284f45;cursor:pointer}@media print{body{background:white}.slide,.slide.activa{display:block;width:100vw;height:100vh;break-after:page}nav{display:none}@page{size:16in 9in;margin:0}}</style>'''+html_slides+'''<nav><button onclick="mover(-1)">Anterior</button><button onclick="mover(1)">Siguiente</button></nav><script>let actual=0;const slides=[...document.querySelectorAll('.slide')];function mostrar(){slides.forEach((s,i)=>s.classList.toggle('activa',i===actual))}function mover(n){actual=Math.max(0,Math.min(slides.length-1,actual+n));mostrar()}document.addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();mover(1)}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();mover(-1)}});mostrar()</script></html>'''
    (FUENTES/'Presentacion_PSIQUE.html').write_text(html_final,encoding='utf-8')
    return {'archivo':'Presentacion_PSIQUE.pdf','paginas':len(datos),'formato':'16:9','fuentes':['presentacion.json','Presentacion_PSIQUE.html','diapositivas/','Guion_Presentacion_PSIQUE.md']}

def escalar(o,esc,ox,oy):
    r=dict(o)
    for k in ['x','w','radio','tamano','paso','grueso']:
        if k in r:r[k]=r[k]*esc+(ox if k=='x' else 0)
    for k in ['y','h']:
        if k in r:r[k]=r[k]*esc+(oy if k=='y' else 0)
    if 'puntos' in r:r['puntos']=[(x*esc+ox,y*esc+oy) for x,y in r['puntos']]
    return r

def main():
    DIAGRAMAS.mkdir(exist_ok=True);REVISION.mkdir(parents=True,exist_ok=True)
    preparar_recortes();escenas=diagramas()
    resultados=[informe('Documentacion_Funcional_PSIQUE','Documentación funcional',escenas),informe('Documentacion_Tecnica_PSIQUE','Documentación técnica',escenas),diapositivas(escenas)]
    for r in resultados:r['sha256']=hashlib.sha256((BASE/r['archivo']).read_bytes()).hexdigest()
    (BASE/'evidencias/generacion.json').write_text(json.dumps(resultados,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps([{'archivo':r['archivo'],'paginas':r['paginas']} for r in resultados],ensure_ascii=False))

if __name__=='__main__':main()
