sed -i '' -e 's/        <aside/        {isCommentsOpen \&\& (\
        <aside/g' \
    -e 's/        <\/aside>/        <\/aside>\
        )}/g' \
    -e 's/<div className="pane-main-content">/<div className={`pane-main-content transition-all ${isCommentsOpen ? "max-w-7xl" : "max-w-4xl"}`}>/g' \
    web/src/app/page.tsx
