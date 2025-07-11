CALENDAR=$(gcalcli list  | grep owner | awk '{print $3};' | tail -n 1)
NEXT_EVENT=$(gcalcli agenda --calendar "${CALENDAR}" --nostarted | head -2 | tail -1 | cut -d " " -f 5- | tr -s ' ')

if [[ -z "${NEXT_EVENT}" ]]; then
    exit 0
fi

echo "${NEXT_EVENT}"
