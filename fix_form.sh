sed -i '' -e '1967,1983c\
                <div className="flex items-center justify-between gap-2 pt-1">\
                  <select\
                    data-testid="comment-feedback-type"\
                    value={commentFeedbackType || ""}\
                    onChange={(e) => setCommentFeedbackType(e.target.value as any || null)}\
                    className="flex-1 text-xs bg-slate-900 border border-slate-700/50 text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"\
                  >\
                    <option value="">General (No Badge)</option>\
                    <option value="question">❓ Question</option>\
                    <option value="approve">🟢 Approval</option>\
                    <option value="flag">🚩 Flag risk</option>\
                    <option value="needs">📋 Needs Data</option>\
                  </select>\
                  <button\
                    type="submit"\
                    data-testid="comment-submit-button"\
                    className="bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-4 rounded-lg text-xs font-semibold transition-colors shadow-sm cursor-pointer"\
                  >\
                    Post\
                  </button>\
                </div>\
              </form>\
            </div>\
          )}\
' web/src/app/page.tsx
