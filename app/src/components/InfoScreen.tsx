import { APP_INFO } from '../appInfo'
import { AI_VOTE_POLICY_VERSION } from '../domain/ai/vote'
import { AI_NIGHT_POLICY_VERSION } from '../domain/ai/night'

// 情報タブ：バージョン情報と製作者へのリンク。
export function InfoScreen() {
  return (
    <div className="screen">
      <section className="card">
        <h2>{APP_INFO.name}</h2>
        <p>{APP_INFO.description}</p>
        <table>
          <tbody>
            <tr>
              <th>バージョン</th>
              <td>{__APP_VERSION__}</td>
            </tr>
            <tr>
              <th>ビルド日</th>
              <td>{__BUILD_DATE__}</td>
            </tr>
            <tr>
              <th>AIの判断方式</th>
              <td>
                投票 {AI_VOTE_POLICY_VERSION}／夜行動 {AI_NIGHT_POLICY_VERSION}
              </td>
            </tr>
            {APP_INFO.author && (
              <tr>
                <th>製作者</th>
                <td>{APP_INFO.author}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>リンク</h2>
        <ul>
          {APP_INFO.links.map((l) => (
            <li key={l.label}>
              {l.url ? (
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label}
                </a>
              ) : (
                <span>
                  {l.label}：<span className="hint">準備中</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
