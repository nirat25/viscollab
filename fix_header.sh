sed -i '' -e '/<button/!b' -e '/onClick={handleLogout}/!b' -e 'i\
          <button\
            onClick={() => setIsCommentsOpen(!isCommentsOpen)}\
            className={`p-2 rounded-xl border transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${isCommentsOpen ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}\
            title="Toggle Comments"\
          >\
            <MessageSquare className="h-4 w-4" />\
            Comments\
          </button>\
' web/src/app/page.tsx
