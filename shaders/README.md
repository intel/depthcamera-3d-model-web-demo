# Shader programs

Each file contains a single shader program, except 'common.js' which contains
snippets and constants that can be included into other programs. Do not add any
newlines or text before the definition of the JS variable that contains the
shader, because it would affect the line numbers (this is why the licence is
inside the variable). This way, when there is a reported compilation error on
line 30, you can actually find the offending code on line 30 of the file. The
snippets of code in 'common.js' are merged into a single line, so they don't
affect this.

## Naming conventions
The name 'imageCoord' is used for coordinates in the projection/image plane,
centered at (0, 0). Points smaller than (-0.5, -0.5) or bigger than (0.5, 0.5)
are considered to be outside of the valid rectangle on the projection plane and
may be ignored.

The name 'texCoord' is used for coordinates into a texture. Can be calculated
from the imageCoord as 'texCoord = imageCoord + 0.5'. Points smaller than (0.0,
0.0) and bigger than (1.0, 1.0) are outside of the texture and will usually be
ignored.

Attributes that are inputs into a program have a prefix 'in', outputs have
a prefix 'out'. Those that are passed between the vertex shader and fragment
shader have a prefix 'a'.
