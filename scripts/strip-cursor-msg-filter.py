import sys

sys.stdout.write("".join(line for line in sys.stdin if "Co-authored-by: Cursor" not in line))
