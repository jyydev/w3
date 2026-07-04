export function Section({ title, children }) {
  return (
    <section className="refSection">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Table({ rows }) {
  return (
    <table className="refTable">
      <tbody>
        {rows.map(([name, detail]) => (
          <tr key={name}>
            <th>{name}</th>
            <td>{detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function List({ items }) {
  return (
    <ul className="refDashList">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
