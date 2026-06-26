function Logo({ page }) {
  console.log("return");
  return (
    <div className="flex mb-1">
      <span className="orange">W3</span>
      {page && <span>{page}</span>}
    </div>
  );
}

export default Logo;
