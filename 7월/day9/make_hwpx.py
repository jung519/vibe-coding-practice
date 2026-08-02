# B-09-O1 — 모닝브루 사업 개요 HWPX 생성
# HWPX = OWPML(KS X 6101) 기반 XML을 zip으로 묶은 개방형 한글 문서 포맷
# 실행: python3 day9/make_hwpx.py
import zipfile, os

OUT = 'day9/B-09-O1/모닝브루_사업개요.hwpx'

VERSION_XML = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="9, 1, 1, 5656"/>
'''

CONTAINER_XML = '''<?xml version="1.0" encoding="UTF-8"?>
<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">
  <ocf:rootfiles>
    <ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
  </ocf:rootfiles>
</ocf:container>
'''

MANIFEST_XML = '''<?xml version="1.0" encoding="UTF-8"?>
<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <odf:file-entry odf:full-path="/" odf:media-type="application/hwp+zip"/>
  <odf:file-entry odf:full-path="Contents/header.xml" odf:media-type="application/xml"/>
  <odf:file-entry odf:full-path="Contents/section0.xml" odf:media-type="application/xml"/>
</odf:manifest>
'''

CONTENT_HPF = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="" unique-identifier="" id="">
  <opf:metadata>
    <opf:title>모닝브루 사업 개요</opf:title>
    <opf:language>ko</opf:language>
    <opf:meta name="creator" content="정해린(모닝브루) — 바이브 코딩 실습"/>
    <opf:meta name="CreatedDate" content="2026-07-16"/>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>
    <opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="header" linear="yes"/>
    <opf:itemref idref="section0" linear="yes"/>
  </opf:spine>
</opf:package>
'''

HEADER_XML = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" version="1.4" secCnt="1">
  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
  <hh:refList>
    <hh:fontfaces itemCnt="1">
      <hh:fontface lang="HANGUL" fontCnt="1">
        <hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/>
      </hh:fontface>
    </hh:fontfaces>
    <hh:charProperties itemCnt="2">
      <hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0">
        <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
      </hh:charPr>
      <hh:charPr id="1" height="1600" textColor="#5C3D2E" shadeColor="none" useFontSpace="0" useKerning="0">
        <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
        <hh:bold/>
      </hh:charPr>
    </hh:charProperties>
    <hh:paraProperties itemCnt="1">
      <hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">
        <hh:align horizontal="JUSTIFY" vertical="BASELINE"/>
      </hh:paraPr>
    </hh:paraProperties>
    <hh:styles itemCnt="1">
      <hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/>
    </hh:styles>
  </hh:refList>
</hh:head>
'''

def para(text, char_pr=0):
    return f'''  <hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="{char_pr}"><hp:t>{text}</hp:t></hp:run>
  </hp:p>
'''

BODY = [
    ('모닝브루 사업 개요', 1),
    ('"줄 서는 5분, 예약하면 0분." — 망원동 핸드드립 카페 · 아침 픽업 예약 서비스', 0),
    ('', 0),
    ('1. 문제(가설): 출근길 직장인은 프랜차이즈 줄서기로 시간에 쫓기고, 대기 시간을 예측할 수 없다. 편의점 커피는 품질이 아쉽다. (검증 진행 중)', 0),
    ('2. 타깃: 망원역 2번 출구 인근으로 출근하는 30대 직장인 — 아침 8~9시, 품질 좋은 커피를 원하는 사람.', 0),
    ('3. 해결책: 이른 아침(08시 오픈) + 직접 내린 핸드드립 + 골목의 편안함 + 사전 픽업 예약.', 0),
    ('4. 운영: 픽업 08:00~10:00, 10분 단위 슬롯, 슬롯당 3잔 한정(품질 유지), 월요일 휴무. 핸드드립 5,500원 · 오늘의 원두 4,500원 · 수제 스콘 3,500원.', 0),
    ('5. 시장: 국내 커피 시장 약 10조 원(2025, 웹 검색 확정 — 집계 기준별 10~21조). 상권·수요 수치는 추정으로 실사 예정.', 0),
    ('6. 현황: 공개 웹 서비스 운영 중 (vibe-coding-practice-xi.vercel.app/day1/) — 예약·슬롯·관리자 시스템 가동.', 0),
    ('', 0),
    ('대표 정해린 · 02-123-4567 · @morningbrew_official · 2026년 7월 16일', 0),
    ('(바이브 코딩 기초반 실습용 가상 사업 문서 — Claude Code로 생성한 HWPX)', 0),
]

SECTION_XML = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" '
    'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">\n'
    + ''.join(para(t, c) for t, c in BODY) +
    '</hs:sec>\n')

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    # mimetype은 압축 없이 첫 항목으로 (OCF 규약)
    z.writestr(zipfile.ZipInfo('mimetype'), 'application/hwp+zip', compress_type=zipfile.ZIP_STORED)
    z.writestr('version.xml', VERSION_XML)
    z.writestr('META-INF/container.xml', CONTAINER_XML)
    z.writestr('META-INF/manifest.xml', MANIFEST_XML)
    z.writestr('Contents/content.hpf', CONTENT_HPF)
    z.writestr('Contents/header.xml', HEADER_XML)
    z.writestr('Contents/section0.xml', SECTION_XML)

print(f'{OUT} 생성 완료')
