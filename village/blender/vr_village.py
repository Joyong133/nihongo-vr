"""
VR 일본 전통 마을 (벚꽃 마을) - Blender 5.x / 4.x 용
- 실제 크기(m), 사람 눈높이 1.65m 기준으로 걸어다닐 수 있는 마을
- VR(Quest)용으로 가볍게: 단색 재질 + 로우폴리 + 재질별로 메쉬를 합쳐 드로우콜 최소화
- 실행하면 village_vr.glb 파일도 자동으로 내보냄 (three.js / Unity / Godot 에 바로 사용)
Scripting 탭에 붙여넣고 Run Script (Alt+P). 다시 실행하면 이전 마을을 지우고 새로 만듭니다.
"""
import bpy
import bmesh
import math
import os
import random
from mathutils import Matrix, Vector, Euler

# ================= 설정 =================
SEED = 7                 # 바꾸면 나무/바위 배치가 달라짐
EXPORT_GLB = True        # village_vr.glb 자동 내보내기
REMOVE_DEFAULT_OBJECTS = True   # 기본 큐브/카메라/라이트 삭제
# ========================================

rng = random.Random(SEED)
I4 = Matrix.Identity(4)


# ---------- 이전 결과 정리 ----------
def cleanup():
    defaults = {"Cube", "Camera", "Light"} if REMOVE_DEFAULT_OBJECTS else set()
    ids = []
    for o in list(bpy.data.objects):
        if o.name.startswith("VR_") or o.name in defaults:
            ids.append(o)
            if o.data is not None and o.data.users == 1:
                ids.append(o.data)
    if ids:
        bpy.data.batch_remove(ids)
    for c in list(bpy.data.collections):
        if c.name.startswith("VR_"):
            bpy.data.collections.remove(c)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for d in list(coll):
            if d.name.startswith("VR_") and d.users == 0:
                coll.remove(d)


cleanup()
col = bpy.data.collections.new("VR_Village")
bpy.context.scene.collection.children.link(col)


# ---------- 재질 (glTF로 그대로 내보내지는 단색 재질만 사용) ----------
def mat(name, color, roughness=0.8, metallic=0.0, emission=None, strength=0.0):
    m = bpy.data.materials.new("VR_" + name)
    if bpy.app.version < (5, 0, 0):
        m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        bsdf.inputs[key].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    m.diffuse_color = (*color, 1)
    return m


GRASS = mat("Grass", (0.20, 0.36, 0.11))
DIRT = mat("Dirt", (0.36, 0.27, 0.17))
STONE = mat("Stone", (0.42, 0.41, 0.39))
GRAVEL = mat("Gravel", (0.70, 0.68, 0.64))
ROCK = mat("Rock", (0.28, 0.28, 0.29))
PLASTER = mat("Plaster", (0.86, 0.83, 0.76))
DARKWOOD = mat("DarkWood", (0.10, 0.06, 0.035))
WOOD = mat("Wood", (0.36, 0.21, 0.10))
PAPER = mat("Paper", (0.92, 0.89, 0.80), emission=(1.0, 0.9, 0.7), strength=0.15)
ROOF = mat("RoofTile", (0.11, 0.12, 0.15), roughness=0.55)
COPPER = mat("CopperRoof", (0.16, 0.36, 0.30), roughness=0.5)
RED = mat("Vermilion", (0.62, 0.07, 0.03), roughness=0.5)
BLACK = mat("Black", (0.02, 0.02, 0.02))
GOLD = mat("Gold", (0.8, 0.6, 0.2), roughness=0.3, metallic=1.0)
LANTERN = mat("Lantern", (0.8, 0.15, 0.05), emission=(1.0, 0.35, 0.1), strength=2.0)
FLAME = mat("LanternLight", (1.0, 0.8, 0.5), emission=(1.0, 0.75, 0.4), strength=3.0)
SAKURA = mat("Sakura", (0.95, 0.62, 0.72))
SAKURA2 = mat("SakuraDeep", (0.86, 0.45, 0.60))
PETALS = mat("Petals", (0.93, 0.70, 0.78))
PINE = mat("Pine", (0.06, 0.19, 0.08))
LEAF = mat("Leaf", (0.15, 0.32, 0.09))
TRUNK = mat("Trunk", (0.20, 0.12, 0.07))
WATER = mat("Water", (0.08, 0.27, 0.36), roughness=0.05)
RICE = mat("Rice", (0.35, 0.55, 0.15))
MOUNTAIN = mat("Mountain", (0.16, 0.26, 0.16))
FAR_MOUNTAIN = mat("FarMountain", (0.22, 0.30, 0.40))
SNOW = mat("Snow", (0.95, 0.96, 0.98), roughness=0.6)
CLOUD = mat("Cloud", (1.0, 1.0, 1.0), emission=(1.0, 1.0, 1.0), strength=0.4)
NOREN = [mat("NorenIndigo", (0.04, 0.08, 0.28)), mat("NorenRed", (0.55, 0.06, 0.06)),
         mat("NorenGreen", (0.08, 0.28, 0.16))]
STRAW = mat("Straw", (0.75, 0.62, 0.35))


# ---------- 메쉬 빌더: 재질별로 하나의 메쉬에 모아서 만든다 (VR 최적화) ----------
class Builder:
    def __init__(self):
        self.bms = {}

    def bm(self, m):
        return self.bms.setdefault(m, bmesh.new())

    @staticmethod
    def xf(loc, rot=(0, 0, 0), scale=(1, 1, 1), frame=None):
        M = Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1.0))
        return frame @ M if frame else M

    def box(self, m, loc, size, rot=(0, 0, 0), frame=None):
        bmesh.ops.create_cube(self.bm(m), size=1.0, matrix=self.xf(loc, rot, size, frame))

    def cyl(self, m, loc, r, h, segs=10, r2=None, rot=(0, 0, 0), frame=None):
        bmesh.ops.create_cone(self.bm(m), cap_ends=True, cap_tris=False, segments=segs,
                              radius1=r, radius2=r if r2 is None else r2, depth=h,
                              matrix=self.xf(loc, rot, (1, 1, 1), frame))

    def ball(self, m, loc, r, scale=(1, 1, 1), sub=1, rot=(0, 0, 0)):
        bmesh.ops.create_icosphere(self.bm(m), subdivisions=sub, radius=r,
                                   matrix=self.xf(loc, rot, scale))

    def disc(self, m, loc, r, segs=14):
        bmesh.ops.create_circle(self.bm(m), cap_ends=True, segments=segs, radius=r,
                                matrix=Matrix.Translation(loc))

    def prism(self, m, prof, x0, x1, frame=None):
        """YZ 단면(prof)을 X 방향으로 x0~x1 만큼 늘린 기둥 (지붕/박공용)"""
        bm, M = self.bm(m), frame or I4
        a = [bm.verts.new(M @ Vector((x0, y, z))) for y, z in prof]
        b = [bm.verts.new(M @ Vector((x1, y, z))) for y, z in prof]
        faces = [bm.faces.new(list(reversed(a))), bm.faces.new(b)]
        n = len(prof)
        for i in range(n):
            j = (i + 1) % n
            faces.append(bm.faces.new((a[i], a[j], b[j], b[i])))
        bmesh.ops.recalc_face_normals(bm, faces=faces)

    def build(self, parent):
        objs = []
        for m, bm in self.bms.items():
            me = bpy.data.meshes.new(m.name)
            bm.to_mesh(me)
            bm.free()
            me.materials.append(m)
            o = bpy.data.objects.new(m.name.replace("VR_", "VR_Village_"), me)
            col.objects.link(o)
            o.parent = parent
            objs.append(o)
        return objs


B = Builder()


def smooth(e0, e1, x):
    t = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def river_y(x):
    return 8 + 3 * math.sin(x / 12)


def ground_h(x, y):
    """마을(반경 42m)은 평평, 바깥은 언덕. 강 주변은 골짜기로 낮춤"""
    r = math.hypot(x, y)
    hill = 6.0 * smooth(42, 75, r)
    noise = (math.sin(x * 0.09) * math.cos(y * 0.07) + 0.6 * math.sin(x * 0.031 + y * 0.043 + 1.3)) \
        * 2.2 * smooth(45, 80, r)
    valley = smooth(4.5, 14, abs(y - river_y(x)))
    return (hill + noise) * valley


# ================= 지형 =================
def terrain():
    bm = B.bm(GRASS)
    radii = [0.0]
    while radii[-1] < 60:
        radii.append(radii[-1] + 2)
    while radii[-1] < 140:
        radii.append(radii[-1] + 6)
    while radii[-1] < 260:
        radii.append(radii[-1] + 20)
    segs = 128
    center = bm.verts.new((0, 0, 0))
    rings = []
    for r in radii[1:]:
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            x, y = r * math.cos(a), r * math.sin(a)
            ring.append(bm.verts.new((x, y, ground_h(x, y))))
        rings.append(ring)
    for k in range(segs):
        bm.faces.new((center, rings[0][k], rings[0][(k + 1) % segs]))
    for i in range(len(rings) - 1):
        for k in range(segs):
            j = (k + 1) % segs
            bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][j], rings[i][j]))


def river():
    bm = B.bm(WATER)
    left, right = [], []
    x = -250.0
    while x <= 250:
        y = river_y(x)
        left.append(bm.verts.new((x, y - 3.2, 0.05)))
        right.append(bm.verts.new((x, y + 3.2, 0.05)))
        x += 2.0
    for i in range(len(left) - 1):
        bm.faces.new((left[i], left[i + 1], right[i + 1], right[i]))
    x = -60.0   # 강가 바위
    while x <= 60:
        if abs(x) > 4:
            for side in (-1, 1):
                if rng.random() < 0.7:
                    s = rng.uniform(0.3, 0.8)
                    B.ball(ROCK, (x + rng.uniform(-0.8, 0.8), river_y(x) + side * rng.uniform(3.0, 3.8), 0.05),
                           s, scale=(1.3, 1.0, 0.6), rot=(0, 0, rng.uniform(0, 3)))
        x += 2.2


# ================= 건물 =================
def gable_roof(F, w, d_span, base, cy=0.0, pitch=0.5, over=0.8, t=0.18, roof=ROOF, wall=PLASTER):
    tp = math.tan(pitch)
    S = d_span / 2 + over
    zl = base + 0.05 - over * tp
    za = base + 0.05 + d_span / 2 * tp
    B.prism(roof, [(cy - S, zl), (cy, za), (cy + S, zl), (cy + S, zl + t), (cy, za + t), (cy - S, zl + t)],
            -w / 2 - 0.6, w / 2 + 0.6, F)
    B.prism(wall, [(cy - d_span / 2, base), (cy + d_span / 2, base), (cy, za)], -w / 2, w / 2, F)
    B.box(BLACK if roof is ROOF else roof, (0, cy, za + t), (w + 1.3, 0.35, 0.3), frame=F)
    return za + t


def lattice(F, cx, cz, w, h, y, bars=7):
    B.box(PAPER, (cx, y, cz), (w, 0.06, h), frame=F)
    for i in range(bars):
        B.box(DARKWOOD, (cx - w / 2 + w * (i + 0.5) / bars, y + 0.03, cz), (0.05, 0.06, h + 0.04), frame=F)
    for dz in (-h / 2, h / 2):
        B.box(DARKWOOD, (cx, y + 0.03, cz + dz), (w + 0.08, 0.07, 0.06), frame=F)


def house(cx, cy, facing, w=6.0, d=7.0, stories=1, shop=None):
    """machiya 스타일 집. facing: 집 앞면이 바라보는 방향 (단위 벡터)"""
    rz = math.atan2(facing[1], facing[0]) - math.pi / 2
    F = Matrix.Translation((cx, cy, 0)) @ Matrix.Rotation(rz, 4, 'Z')
    z0, h1 = 0.3, 2.9
    B.box(STONE, (0, 0, 0.15), (w + 0.3, d + 0.3, 0.3), frame=F)
    B.box(PLASTER, (0, 0, z0 + h1 / 2), (w, d, h1), frame=F)
    B.box(DARKWOOD, (0, 0, z0 + 0.5), (w + 0.04, d + 0.04, 1.0), frame=F)
    for sx in (-1, 1):
        for sy in (-1, 1):
            B.box(DARKWOOD, (sx * w / 2, sy * d / 2, z0 + h1 / 2), (0.22, 0.22, h1), frame=F)
    B.box(DARKWOOD, (0, 0, z0 + h1 - 0.11), (w + 0.1, d + 0.1, 0.22), frame=F)

    fy = d / 2 + 0.03
    door_x = -w * 0.2
    B.box(DARKWOOD, (door_x, fy, z0 + 1.05), (1.7, 0.08, 2.1), frame=F)
    lattice(F, w * 0.22, z0 + 1.55, w * 0.32, 1.1, fy)
    if shop is not None:
        B.box(DARKWOOD, (door_x, fy + 0.25, z0 + 2.35), (1.9, 0.05, 0.05), frame=F)
        for i in (-1, 0, 1):
            B.box(NOREN[shop], (door_x + i * 0.6, fy + 0.25, z0 + 2.0), (0.56, 0.03, 0.65), frame=F)
        lx = door_x + 1.2
        B.cyl(LANTERN, (lx, fy + 0.4, z0 + 2.1), 0.2, 0.5, segs=10, frame=F)
        for dz in (-0.27, 0.27):
            B.cyl(BLACK, (lx, fy + 0.4, z0 + 2.1 + dz), 0.13, 0.05, segs=10, frame=F)
        # 가게 앞 나무통
        B.cyl(WOOD, (w / 2 - 0.5, fy + 0.6, 0.4), 0.3, 0.8, segs=10, frame=F)

    top = z0 + h1
    if stories == 2:
        B.box(ROOF, (0, d / 2 + 0.45, top + 0.15), (w + 0.5, 1.4, 0.1), rot=(-0.35, 0, 0), frame=F)
        h2, d2, cy2 = 2.2, d - 1.0, -0.5
        B.box(PLASTER, (0, cy2, top + h2 / 2), (w, d2, h2), frame=F)
        B.box(DARKWOOD, (0, cy2, top + h2 - 0.1), (w + 0.1, d2 + 0.1, 0.2), frame=F)
        B.box(DARKWOOD, (0, cy2, top + 0.1), (w + 0.1, d2 + 0.1, 0.2), frame=F)
        lattice(F, 0, top + 1.1, w * 0.55, 0.7, cy2 + d2 / 2 + 0.03, bars=11)
        gable_roof(F, w, d2, top + h2, cy=cy2)
    else:
        gable_roof(F, w, d, top)


def torii(x, y, rz=0.0):
    F = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rz, 4, 'Z')
    for sx in (-2.0, 2.0):
        B.cyl(RED, (sx, 0, 2.3), 0.28, 4.6, segs=12, frame=F)
        B.cyl(BLACK, (sx, 0, 0.2), 0.34, 0.4, segs=12, frame=F)
    B.box(RED, (0, 0, 3.6), (5.6, 0.3, 0.32), frame=F)
    B.box(RED, (0, 0, 4.45), (6.4, 0.45, 0.35), frame=F)
    B.box(BLACK, (0, 0, 4.78), (7.0, 0.6, 0.32), frame=F)
    B.box(BLACK, (0, -0.2, 4.05), (0.7, 0.08, 0.6), frame=F)   # 현판


def stone_lantern(x, y):
    B.box(STONE, (x, y, 0.15), (0.8, 0.8, 0.3))
    B.cyl(STONE, (x, y, 0.85), 0.16, 1.1, segs=6)
    B.box(STONE, (x, y, 1.45), (0.7, 0.7, 0.12))
    B.box(FLAME, (x, y, 1.75), (0.42, 0.42, 0.45))
    for sx in (-1, 1):
        for sy in (-1, 1):
            B.box(STONE, (x + sx * 0.25, y + sy * 0.25, 1.75), (0.1, 0.1, 0.48))
    B.cyl(STONE, (x, y, 2.15), 0.62, 0.38, segs=4, r2=0.12, rot=(0, 0, math.pi / 4))
    B.ball(STONE, (x, y, 2.4), 0.12, sub=1)


def shrine(x, y):
    F = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.pi, 4, 'Z')   # 마을(남쪽)을 바라봄
    w, d, h, base = 9.0, 7.0, 3.6, 0.9
    B.box(STONE, (0, 0, base / 2), (w + 3, d + 3, base), frame=F)
    for i in range(3):   # 계단 (맨 윗단이 기단에 바로 붙도록)
        B.box(STONE, (0, d / 2 + 1.5 + 0.225 + 0.45 * (2 - i), 0.15 * (i + 1)), (3.5, 0.45, 0.3 * (i + 1)), frame=F)
    B.box(PLASTER, (0, 0, base + h / 2), (w - 0.4, d - 0.4, h), frame=F)
    for px in (-w / 2, -w / 6, w / 6, w / 2):
        for py in (-d / 2, d / 2):
            B.cyl(RED, (px, py, base + h / 2), 0.2, h, segs=10, frame=F)
    B.box(RED, (0, 0, base + h - 0.15), (w + 0.2, d + 0.2, 0.3), frame=F)
    B.box(WOOD, (0, d / 2 - 0.2, base + 0.12), (w + 0.6, 1.2, 0.24), frame=F)   # 툇마루
    B.box(WOOD, (0, d / 2 + 0.6, base + 0.45), (1.6, 0.7, 0.7), frame=F)        # 새전함
    B.cyl(STRAW, (0, d / 2 + 0.05, base + h - 0.5), 0.12, w - 1.0, segs=8, rot=(0, math.pi / 2, 0), frame=F)
    B.ball(GOLD, (x, y - (d / 2 + 0.1), base + h - 0.85), 0.2)   # 방울 (신사가 180° 돌아 있어서 y를 뺌)
    lattice(F, -w / 3, base + 1.6, 1.8, 1.8, (d - 0.4) / 2 + 0.03)
    lattice(F, w / 3, base + 1.6, 1.8, 1.8, (d - 0.4) / 2 + 0.03)
    gable_roof(F, w, d, base + h, pitch=0.6, over=1.6, t=0.3, roof=COPPER, wall=RED)


def pagoda(x, y):
    B.box(STONE, (x, y, 0.4), (7.5, 7.5, 0.8))
    z = 0.8
    for i in range(5):
        s = 5.2 - i * 0.6
        B.box(RED, (x, y, z + 1.2), (s * 0.7, s * 0.7, 2.4))
        lattice_w = s * 0.35
        for rz in (0, math.pi / 2, math.pi, -math.pi / 2):
            F = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rz, 4, 'Z')
            B.box(DARKWOOD, (0, s * 0.35 + 0.03, z + 1.1), (lattice_w, 0.06, 1.6), frame=F)
        B.cyl(ROOF, (x, y, z + 2.75), s * 0.95, 0.7, segs=4, r2=s * 0.42, rot=(0, 0, math.pi / 4))
        z += 3.0
    B.cyl(GOLD, (x, y, z + 2.2), 0.12, 4.6, segs=8)
    for i in range(7):
        B.cyl(GOLD, (x, y, z + 0.9 + i * 0.45), 0.35 - i * 0.025, 0.06, segs=10)


def well(x, y):
    B.cyl(STONE, (x, y, 0.4), 0.85, 0.8, segs=12)
    B.cyl(WATER, (x, y, 0.79), 0.65, 0.02, segs=12)
    for sx in (-0.95, 0.95):
        B.box(WOOD, (x + sx, y, 1.2), (0.12, 0.12, 2.4))
    B.box(WOOD, (x, y, 2.3), (2.1, 0.12, 0.12))
    B.cyl(WOOD, (x, y, 1.7), 0.15, 0.3, segs=8)
    B.prism(ROOF, [(-0.9, 2.35), (0, 2.85), (0.9, 2.35), (0.9, 2.45), (0, 2.95), (-0.9, 2.45)],
            -1.3, 1.3, Matrix.Translation((x, y, 0)))


def paddies(x0, y0, x1, y1):
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    B.box(DIRT, (mx, my, 0.06), (x1 - x0 + 1.0, y1 - y0 + 1.0, 0.12))
    for px0, px1 in ((x0, mx), (mx, x1)):
        for py0, py1 in ((y0, my), (my, y1)):
            cx, cy = (px0 + px1) / 2, (py0 + py1) / 2
            B.box(WATER, (cx, cy, 0.13), (px1 - px0 - 0.6, py1 - py0 - 0.6, 0.02))
            n = int((px1 - px0 - 1.0) / 0.8)
            for k in range(n):
                B.box(RICE, (px0 + 0.7 + k * 0.8, cy, 0.3), (0.18, py1 - py0 - 1.2, 0.35))


# ================= 나무 =================
_petal_layer = [0]


def sakura(x, y, s=1.0):
    z = ground_h(x, y)
    B.cyl(TRUNK, (x, y, z + 1.2 * s), 0.28 * s, 2.4 * s, segs=7, r2=0.16 * s)
    for a in (0.6, 2.7, 4.6):
        B.cyl(TRUNK, (x + math.cos(a) * 0.5 * s, y + math.sin(a) * 0.5 * s, z + 2.6 * s), 0.1 * s, 1.4 * s,
              segs=5, rot=(math.sin(a) * -0.6, math.cos(a) * 0.6, 0))
    for i in range(5):
        a = i * 1.3 + rng.uniform(0, 0.5)
        rr = 0 if i == 0 else rng.uniform(0.9, 1.4) * s
        B.ball(SAKURA if i % 2 else SAKURA2,
               (x + math.cos(a) * rr, y + math.sin(a) * rr, z + (3.6 if i == 0 else 3.1 + rng.uniform(0, 0.6)) * s),
               rng.uniform(1.3, 1.7) * s, scale=(1, 1, 0.75), rot=(0, 0, rng.uniform(0, 3)))
    _petal_layer[0] += 1   # 겹치는 꽃잎끼리 깜빡이지 않도록 높이를 조금씩 다르게
    B.disc(PETALS, (x, y, z + 0.008 + 0.003 * (_petal_layer[0] % 6)), 2.6 * s)


def pine(x, y, s=1.0):
    z = ground_h(x, y)
    B.cyl(TRUNK, (x, y, z + 1.0 * s), 0.25 * s, 2.0 * s, segs=6)
    for i, (r, h) in enumerate(((2.2, 3.0), (1.7, 2.6), (1.1, 2.2))):
        B.cyl(PINE, (x, y, z + (2.6 + i * 1.6) * s), r * s, h * s, segs=7, r2=0.05,
              rot=(0, 0, rng.uniform(0, 3)))


def round_tree(x, y, s=1.0):
    z = ground_h(x, y)
    B.cyl(TRUNK, (x, y, z + 1.0 * s), 0.2 * s, 2.0 * s, segs=6)
    B.ball(LEAF, (x, y, z + 2.9 * s), 1.6 * s, scale=(1, 1, 1.1), rot=(0, 0, rng.uniform(0, 3)))


# ================= 마을 배치 =================
terrain()
river()

# 길: 남북 큰길(돌) + 동서 골목(흙) + 신사 참배길(자갈)
by = river_y(0)
B.box(STONE, (0, -18, 0.03), (3, 30, 0.06))                  # y -33 ~ -3 ... 다리 앞까지
B.box(STONE, (0, (by - 3.6 - 3) / 2, 0.03), (3, by - 3.6 + 3, 0.06))
B.box(DIRT, (0, -14, 0.025), (60, 3, 0.05))
B.box(GRAVEL, (0, 22, 0.025), (16, 14, 0.05))                 # 신사 앞 자갈 마당
B.box(STONE, (0, by + 3.6 + (15 - by - 3.6) / 2, 0.03), (3, 15 - by - 3.6, 0.06))

# 붉은 아치 다리 (강 위)
y0, y1, n = by - 4.2, by + 4.2, 14
for i in range(n):
    t0, t1 = i / n, (i + 1) / n
    ya, yb = y0 + (y1 - y0) * t0, y0 + (y1 - y0) * t1
    za, zb = 1.1 * math.sin(math.pi * t0) + 0.1, 1.1 * math.sin(math.pi * t1) + 0.1
    ang = math.atan2(zb - za, yb - ya)
    B.box(WOOD, (0, (ya + yb) / 2, (za + zb) / 2), (3.2, math.hypot(yb - ya, zb - za) + 0.02, 0.18), rot=(ang, 0, 0))
    for sx in (-1.6, 1.6):
        B.box(RED, (sx, (ya + yb) / 2, (za + zb) / 2 + 0.95), (0.12, math.hypot(yb - ya, zb - za) + 0.02, 0.1),
              rot=(ang, 0, 0))
        if i % 2 == 0:
            B.box(RED, (sx, ya, za + 0.5), (0.14, 0.14, 1.0))
for sx in (-1.6, 1.6):
    B.box(RED, (sx, y1, 0.6), (0.14, 0.14, 1.0))
    for yy in (y0, y1):
        B.ball(GOLD, (sx, yy, 1.2), 0.12)

# 큰길 양옆 집 (서쪽은 동쪽을, 동쪽은 서쪽을 바라봄)
for i, yy in enumerate((-26.0, -19.5, -8.5, -2.0)):
    house(-5.8, yy, (1, 0), stories=2 if i % 2 == 0 else 1, shop=i % 3)
    house(5.8, yy, (-1, 0), stories=1 if i % 2 == 0 else 2, shop=(i + 1) % 3 if i != 1 else None)
# 골목 양옆 집
for i, xx in enumerate((-15.0, -22.5, 15.0, 22.5)):
    house(xx, -19.25, (0, 1), w=6.0, d=6.5, stories=1 + (i % 2), shop=None if i % 2 else (i // 2))
    house(xx, -8.75, (0, -1), w=6.0, d=6.5, stories=2 - (i % 2))

well(-13.0, -1.0)
torii(0, 16)
for yy in (19.5, 23.5):
    for xx in (-2.8, 2.8):
        stone_lantern(xx, yy)
shrine(0, 31)
pagoda(17, 26)
paddies(-28, 15.5, -14, 28)

# 나무
for xx, yy in ((-7, 21), (7, 20), (-9.5, 27), (9.5, 31), (-6, 38.5), (6.5, 39), (11, 19), (-11, 18)):
    sakura(xx, yy, rng.uniform(0.95, 1.25))
x = -38.0
while x <= 38:
    for side in (-1, 1):
        px, py = x + rng.uniform(-1.5, 1.5), river_y(x) + side * rng.uniform(4.8, 6.0)
        busy = abs(px) < 6 or py < 2.0 or (px < -12 and py > 13) or (12 < px < 22 and py > 20)
        if not busy and rng.random() < 0.75:
            sakura(px, py, rng.uniform(0.85, 1.2))
    x += 7.5
for xx, yy in ((-12, -28), (12, -30), (-30, -10), (30, -12), (-30, -26), (28, -2), (-3.5, -36), (3.5, -37)):
    round_tree(xx, yy, rng.uniform(0.9, 1.2))
placed = 0
while placed < 90:
    a, r = rng.uniform(0, 2 * math.pi), rng.uniform(46, 105)
    px, py = r * math.cos(a), r * math.sin(a)
    if abs(py - river_y(px)) > 10:
        pine(px, py, rng.uniform(0.9, 1.5))
        placed += 1

# 먼 산 + 후지산 + 구름
for k in range(16):
    a = rng.uniform(0, 2 * math.pi)
    deg = math.degrees(a) % 180
    if deg < 20 or deg > 160 or 70 < math.degrees(a) % 360 < 110:
        continue
    r, h = rng.uniform(160, 230), rng.uniform(30, 50)
    B.cyl(FAR_MOUNTAIN if r > 200 else MOUNTAIN, (r * math.cos(a), r * math.sin(a), 3 + h / 2),
          rng.uniform(45, 70), h, segs=7, r2=rng.uniform(1, 4), rot=(0, 0, rng.uniform(0, 3)))
fx, fy, fr, fh = -20, 250, 120, 85
B.cyl(FAR_MOUNTAIN, (fx, fy, fh / 2), fr, fh, segs=12, r2=6)
cap_r = 30
cap_h = (cap_r - 6) / (fr - 6) * fh
B.cyl(SNOW, (fx, fy, fh - cap_h / 2 + 0.3), cap_r + 0.6, cap_h, segs=12, r2=6.3)
for k in range(9):
    a, r = rng.uniform(0, 2 * math.pi), rng.uniform(80, 200)
    cx, cy, cz = r * math.cos(a), r * math.sin(a), rng.uniform(55, 85)
    for j in range(4):
        B.ball(CLOUD, (cx + j * 7 + rng.uniform(-2, 2), cy + rng.uniform(-3, 3), cz + rng.uniform(-1, 2)),
               rng.uniform(5, 8), scale=(1.4, 1, 0.5))

# ---------- 오브젝트로 만들기 ----------
root = bpy.data.objects.new("VR_Village", None)
col.objects.link(root)
village_objs = B.build(root)

# 해 + 하늘
sun_data = bpy.data.lights.new("VR_Sun", 'SUN')
sun_data.energy = 3.5
sun_data.color = (1.0, 0.95, 0.88)
sun_data.angle = math.radians(3)
sun = bpy.data.objects.new("VR_Sun", sun_data)
col.objects.link(sun)
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
scene = bpy.context.scene
world = scene.world or bpy.data.worlds.new("World")
scene.world = world
world.color = (0.55, 0.72, 0.95)
bg = next((n for n in (world.node_tree.nodes if world.node_tree else []) if n.type == 'BACKGROUND'), None)
if bg:
    bg.inputs["Color"].default_value = (0.55, 0.72, 0.95, 1)
    bg.inputs["Strength"].default_value = 1.0

# 시작 위치 카메라 (눈높이 1.65m, 마을 입구에서 큰길을 바라봄) - VR 시작 위치로도 쓰임
cam_data = bpy.data.cameras.new("VR_Spawn")
cam_data.lens = 24
cam_data.clip_end = 1000
cam = bpy.data.objects.new("VR_Spawn", cam_data)
col.objects.link(cam)
cam.location = (0, -36, 1.65)
cam.rotation_euler = (math.radians(88), 0, 0)
scene.camera = cam
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080

tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in village_objs)
print(f"마을 완성: 메쉬 {len(village_objs)}개(재질별 1개), 삼각형 약 {tris:,}개")

# ---------- glb 내보내기 ----------
if EXPORT_GLB:
    folder = os.path.dirname(bpy.data.filepath) if bpy.data.filepath else os.path.expanduser("~")
    path = os.path.join(folder, "village_vr.glb")
    bpy.ops.object.select_all(action='DESELECT')
    for o in village_objs:
        o.select_set(True)
    try:
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True)
        print("glb 저장:", path)
    except Exception as e:
        print("glb 내보내기 실패:", e)

# ---------- 뷰포트: 시작 위치에서 보기 ----------
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type != 'VIEW_3D':
            continue
        try:
            space = area.spaces.active
            space.shading.type = 'MATERIAL'
            space.clip_end = 1000
            space.region_3d.view_perspective = 'CAMERA'
        except Exception as e:
            print("뷰 설정 실패 (무시해도 됨):", e)
