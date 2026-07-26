const Toggle = ({ show, setShow }) => {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={show}
        onChange={() => setShow((prev) => !prev)}
      />
      <span className="slider"></span>
    </label>
  );
};
export default Toggle;
