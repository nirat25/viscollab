import diff_match_patch as dmp_module

dmp = dmp_module.diff_match_patch()

def fuzzyFind(text, quote, hintIdx=0):
    loc = hintIdx
    index = -1
    chunkOffset = 0
    for i in range(0, len(quote), 32):
        pattern = quote[i:i+32]
        index = dmp.match_main(text, pattern, loc + i)
        if index != -1:
            chunkOffset = i
            break
            
    if index == -1:
        return {'index': -1, 'score': 0, 'length': 0}
        
    baseIndex = max(0, index - chunkOffset)
    margin = 50
    start = max(0, baseIndex - margin)
    end = min(len(text), baseIndex + len(quote) + margin)
    windowText = text[start:end]
    
    diffs = dmp.diff_main(quote, windowText)
    dmp.diff_cleanupSemantic(diffs)
    
    qPos = 0
    tPos = 0
    matches = 0
    sOff = -1
    eOff = 0
    
    for op, txt in diffs:
        if op == 0:  # EQUAL
            if sOff == -1: sOff = tPos
            qPos += len(txt)
            tPos += len(txt)
            matches += len(txt)
            eOff = tPos
        elif op == -1:  # DELETE
            if sOff == -1: sOff = tPos
            qPos += len(txt)
        elif op == 1:  # INSERT
            tPos += len(txt)
            
        if qPos >= len(quote):
            break
            
    if sOff == -1: sOff = 0
    matchLen = eOff - sOff
    score = matches / max(len(quote), matchLen) if matchLen > 0 else 0
    
    return {
        'index': start + sOff,
        'score': score,
        'length': matchLen,
        'highlighted_text': text[start + sOff : start + sOff + matchLen]
    }

text = "This is a long document where we discuss Vendor A and Vendor B. The recommendation is to migrate the three analytics vendors onto Vendor A next quarter. It will save 52% of costs."
quote = "consolidate the three analytics vendors onto Vendor A this quarter"

# The dmp.match_main in python might behave slightly differently, let's see
res = fuzzyFind(text, quote, 0)
print(res)
