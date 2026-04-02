import traceback
try:
    import test2
    test2.debug()
except Exception as e:
    with open('err.txt', 'w', encoding='utf-8') as f:
        f.write(traceback.format_exc())
